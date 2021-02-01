import {JSONSchemaType} from "ajv";

export interface SignalSchemaInterface {
    type: 'offer' | 'pranswer' | 'answer' | 'rollback';
    sdp: string;
    candidate: {
        candidate: string;
        sdpMLineIndex: number;
        sdpMid: string;
    };
}

export const SignalSchema: JSONSchemaType<SignalSchemaInterface> = {
    type: "object",
    properties: {
        type: {
            type: "string",
            enum: ["offer", "pranswer", "answer", "rollback"]
        },
        sdp: {
            type: "string",
        },
        candidate: {
            type: "object",
            properties: {
                candidate: {
                    type: "string"
                },
                sdpMLineIndex: {
                    type: "number"
                },
                sdpMid: {
                    type: "string"
                }
            },
            required: ["candidate", "sdpMLineIndex", "sdpMid"]
        }
    },
    required: ["type"]
}
