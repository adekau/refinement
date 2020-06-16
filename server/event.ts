import { v4 } from 'https://deno.land/std/uuid/mod.ts';

import { IRoom } from '../shared/types/room.ts';
import { StoryPointEvent } from '../shared/types/story-point-event.ts';
import { IUser } from '../shared/types/user.ts';
import { addUserToRoom, getRoom, getWS, removeUser, setRoom, setUser, setWS } from './data/data.ts';
import Logger from './logger.ts';
import { HandleEventArguments } from './room.ts';
import { translateUsers } from './translation.ts';

export async function emitEvent(users: IUser[], event: StoryPointEvent) {
    for (const user of users) {
        try {
            const ws = getWS(user.userId);
            ws?.send(JSON.stringify(event));
        } catch (e) {
            Logger.warn(`User ${user.userId} can not be reached.`);
            await removeUser(user.userId);
            break;
        }
    }
}

export async function joinEvent({ ev, userId, ws }: HandleEventArguments): Promise<void> {
    if (ev.event !== 'join')
        return;

    setWS(userId, ws);

    const userJoin: IUser = {
        roomId: ev.roomId,
        userId: userId,
        nickname: ev.nickname
    };

    await setUser(userId, userJoin);
    await addUserToRoom(userJoin, ev.roomId);
    
    Logger.log(`User ${userJoin.userId} joined room ${userJoin.roomId}.`);

    const room = await getRoom(ev.roomId);
    const users = room?.users ?? [];
    const event: StoryPointEvent = {
        event: 'userJoin',
        users: translateUsers(users),
        room: room!
    };

    await emitEvent(users, event);
}

export async function leaveEvent({ ev, userId, ws }: HandleEventArguments): Promise<void> {
    if (ev.event !== 'leave')
        return;
    await removeUser(userId);
    const event: StoryPointEvent = {
        event: 'left'
    };
    try {
        ws.send(JSON.stringify(event));
    } catch (e) { }
}

export async function createRoomEvent({ ev, userId, ws }: HandleEventArguments): Promise<void> {
    if (ev.event !== 'create')
        return;
    const roomId = v4.generate();
    const room: IRoom = {
        users: [],
        roomName: ev.roomName,
        id: roomId
    };
    await setRoom(roomId, room);
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