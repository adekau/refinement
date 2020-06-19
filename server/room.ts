import { v4 } from 'https://deno.land/std/uuid/mod.ts';
import { isWebSocketCloseEvent, isWebSocketPingEvent, WebSocket } from 'https://deno.land/std/ws/mod.ts';

import { StoryPointEvent } from '../shared/types/story-point-event.ts';
import { removeUser, setWS } from './data/data.ts';
import { createRoomEvent, joinEvent, kickUsersEvent, leaveEvent, respondWithError } from './event.ts';
import Logger from './logger.ts';

export type HandleEventArguments = { ev: StoryPointEvent, userId: string, ws: WebSocket };

export default async function handle(ws: WebSocket) {
    const userId = v4.generate();
    setWS(userId, ws);
    Logger.log(`User ${userId} connected.`);

    try {
        for await (const data of ws) {
            let parsed: any;

            if (typeof data === "string") {

                try {
                    parsed = JSON.parse(data);
                } catch (ex) {
                    Logger.error(`Unable to parse message ${data}`);
                }

            } else if (data instanceof Uint8Array) {

                try {
                    parsed = JSON.parse((data as Uint8Array).toString());
                } catch (ex) {
                    Logger.error(`Unable to parse message ${data}`);
                }

            } else if (isWebSocketPingEvent(data)) {

                const [body] = data;
                Logger.log(`Got WebSocket ping: ${body}`);

            } else if (isWebSocketCloseEvent(data)) {

                await removeUser(userId);
                Logger.log(`User ${userId} disconnected.`);

            }

            if (parsed)
                await handleEvent({
                    ev: parsed,
                    ws,
                    userId
                });
        }
    } catch (err) {
        Logger.error(`Failed to handle WebSocket message: ${err}`);

        if (!ws.isClosed) {
            await ws.close(1000).catch((e) => Logger.error(`Error closing websocket: ${e}`));
        }
    }
}

async function handleEvent({ ev }: HandleEventArguments): Promise<void> {
    const args = arguments[0];
    const handleWithArgs = handleSafely(args);

    switch (ev.event) {
        case 'join':
            await handleWithArgs(joinEvent);
            break;
        case 'leave':
            await handleWithArgs(leaveEvent);
            break;
        case 'create':
            await handleWithArgs(createRoomEvent);
            break;
        case 'kick':
            await handleWithArgs(kickUsersEvent);
            break;
        default:
            return;
    }
}

const handleSafely = ({ ev, userId, ws }: HandleEventArguments) =>
    async <T>(eventHandler: (eventArgs: HandleEventArguments) => Promise<T>) => {
        try {
            await eventHandler({ ev, userId, ws });
        } catch (ex) {
            Logger.error(`Error while handling event "${ev.event}" for user ${userId}: ${ex}`);
            respondWithError({ ev, userId, ws }, 500, 'Internal server error');
        }
    };