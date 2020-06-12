import { v4 } from 'https://deno.land/std/uuid/mod.ts';
import { isWebSocketCloseEvent, isWebSocketPingEvent, WebSocket } from 'https://deno.land/std/ws/mod.ts';

import { IRoom } from '../shared/types/room.ts';
import { StoryPointEvent } from '../shared/types/story-point-event.ts';
import { IUser } from '../shared/types/user.ts';
import { addUserToRoom, removeUser, roomsMap, usersMap } from './data/data.ts';
import { emitEvent } from './event.ts';
import Logger from './logger.ts';

type HandleEventArguments = { ev: StoryPointEvent, userId: string, ws: WebSocket };

export default async function handle(ws: WebSocket) {
    const userId = v4.generate();
    Logger.log(`User ${userId} connected.`);

    try {
        for await (const data of ws) {
            let parsed: any;
            if (typeof data === "string") {
                parsed = JSON.parse(data);
            } else if (data instanceof Uint8Array) {
                parsed = JSON.parse((data as Uint8Array).toString());
            } else if (isWebSocketPingEvent(data)) {
                const [body] = data;
                console.log("ws:Ping", body);
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
        Logger.error(`Failed to receive frame: ${err}`);

        if (!ws.isClosed) {
            await ws.close(1000).catch((e) => Logger.error(`Error closing websocket: ${e}`));
        }
    }
}

async function handleEvent({ ev, userId }: HandleEventArguments): Promise<void> {
    switch (ev.event) {
        case 'join':
            await userJoinEvent(arguments[0]);
            break;
        case 'leave':
            await removeUser(userId);
            break;
        case 'create':
            await createRoomEvent(arguments[0]);
            break;
        default:
            return;
    }
}

async function userJoinEvent({ ev, userId, ws }: HandleEventArguments): Promise<void> {
    if (ev.event !== 'join')
        return;

    const userJoin: IUser = {
        roomId: ev.roomId,
        websocket: ws,
        userId: userId
    };
    usersMap.set(userId, userJoin);
    await addUserToRoom(userJoin, ev.roomId);
    
    Logger.log(`User ${userJoin.userId} joined room ${userJoin.roomId}.`);

    await emitEvent(ev.roomId);
}

async function createRoomEvent({ ev, userId, ws }: HandleEventArguments): Promise<void> {
    if (ev.event !== 'create')
        return;
    const roomId = v4.generate();
    const room: IRoom = {
        users: [],
        roomName: ev.roomName,
        id: roomId
    };
    roomsMap.set(roomId, room);
    const event = {
        event: 'roomCreate',
        roomId,
        roomName: room.roomName,
        users: room.users
    };

    Logger.log(`Room ${roomId} created.`);

    try {
        await ws.send(JSON.stringify(event));
    } catch (e) {
        Logger.warn(`User ${userId} unable to be reached while creating room.`);
    }
}