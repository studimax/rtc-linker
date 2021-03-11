import express from "express";
import WebSocket from "ws";
import * as http from "http";
import {AddressInfo} from "net";
import {SignalSchema, SignalSchemaInterface} from "./schema/SignalSchema";
import Ajv from "ajv";
import UrlPattern from "url-pattern";
import cors from "cors";

class Signal {
    private static readonly signals = new Map<string, Signal>();
    public readonly uuid;
    public readonly expireAt: Date;
    private remoteSignal?: SignalSchemaInterface;
    private readonly timeout: NodeJS.Timeout;
    private ws?: WebSocket;

    constructor(public readonly signalData: SignalSchemaInterface) {
        const timeoutMs = 60000;
        this.uuid = Signal.createUUID();
        Signal.signals.set(this.uuid, this);
        this.expireAt = new Date(Date.now() + timeoutMs)
        this.timeout = setTimeout(() => {
            console.log("[TIMEOUT]");
            this.delete();
        }, timeoutMs)
    }

    static get(uuid: string) {
        return this.signals.get(uuid)
    }

    public isJoined(): boolean {
        return !!this.ws;
    }

    public join(ws: WebSocket) {
        this.ws = ws;
        this.trySendToHost();
        ws.on("close", () => this.ws = undefined);
    }

    public delete() {
        clearTimeout(this.timeout);
        this.ws?.close();
        Signal.signals.delete(this.uuid);
    }

    public setRemoteSignal(signalData: SignalSchemaInterface) {
        this.remoteSignal = signalData;
        this.trySendToHost();
    }

    private static createUUID(length: number = 6): string {
        const char = "ABCDEFGHJKMNPQRSTUVWXYZ";
        let uuid;
        do {
            uuid = "";
            for (let i = 0; i < length; ++i) {
                uuid += char.charAt(Math.floor(Math.random() * char.length))
            }
        } while (Signal.signals.has(uuid));
        return uuid;
    }

    private trySendToHost(): boolean {
        if (!this.remoteSignal || !this.ws) return false;
        this.ws.send(JSON.stringify(this.remoteSignal));
        this.delete();
        return true;
    }
}

export default class Server {
    public readonly app = express()
    private server?: http.Server;
    private ws?: WebSocket.Server;

    constructor() {
        this.initExpress();
    }

    public async start() {
        this.server = this.app.listen(3000, () => {
            const {port, address} = this.server?.address() as AddressInfo;
            console.log('WebServer server started on %s:%s', address, port);
        });
        this.runWebsocket(this.server);
    }

    private initExpress() {
        const ajv = new Ajv({removeAdditional: false});
        this.app.use(express.json());
        this.app.use(cors());
        this.app.post("/peer", async (req, res) => {
            const data = req.body.signal;
            const validate = await ajv.compile<SignalSchemaInterface>(SignalSchema)
            const valid = validate(data);
            if (!valid)
                return res.status(500).send(ajv.errorsText(validate.errors));
            const signal = new Signal(data);
            return res.json({
                uuid: signal.uuid,
                expireAt: signal.expireAt
            });
        })

        this.app.get("/join/:uuid", async (req, res) => {
            const uuid = req.params.uuid;
            const signal = Signal.get(uuid);
            if (!signal)
                return res.status(404).send("no room found");
            return res.json({
                signal: signal.signalData
            });
        });

        this.app.post("/join/:uuid", async (req, res) => {
            const signalData = req.body.signal;
            const uuid = req.params.uuid;
            const signal = Signal.get(uuid);
            if (!signal)
                return res.status(404).send("no room found");
            const validate = await ajv.compile<SignalSchemaInterface>(SignalSchema)
            const valid = validate(signalData);
            if (!valid)
                return res.status(500).send(ajv.errorsText(validate.errors));
            signal.setRemoteSignal(signalData);
            return res.json(true);
        })
    }

    private runWebsocket(server: http.Server) {
        this.ws = new WebSocket.Server({noServer: true});
        const pattern = new UrlPattern('/:uuid');
        server.on('upgrade', (request, socket, head) => {
            const uuid = pattern.match(request.url)?.uuid;
            const signal = Signal.get(uuid);
            if (!signal || signal.isJoined()) return socket.destroy();
            this.ws?.handleUpgrade(request, socket, head, (ws) => {
                signal.join(ws);
                this.ws?.emit('connection', ws, request);
            });
        });
    }
}
