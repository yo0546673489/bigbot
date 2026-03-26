import { initAuthCreds, BufferJSON, SignalDataTypeMap, AuthenticationState } from '@whiskeysockets/baileys'
import Redis from 'ioredis'

export default async function useRedisAuthState(
    redis: Redis,
    sessionId: string
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
    const credsKey = `wa:${sessionId}:creds`;
    const keyPrefix = `wa:${sessionId}:keys`;
    const writeData = async (key: string, value: any) => {
        try {
            await redis.set(key, JSON.stringify(value, BufferJSON.replacer));
        } catch (error) {
            console.error(`Redis write failed for ${key}`, error);
        }
    };

    const readData = async (key: string) => {
        const data = await redis.get(key);
        return data ? JSON.parse(data, BufferJSON.reviver) : undefined;
    };

    // ✅ Block until creds are loaded
    const savedCreds = await readData(credsKey);
    const state: AuthenticationState = {
        creds: savedCreds || initAuthCreds(),
        keys: {
            get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
                const data: { [id: string]: SignalDataTypeMap[T] } = {};
                for (const id of ids) {
                    const value = await readData(`${keyPrefix}:${type}:${id}`);
                    if (value) data[id] = value;
                }
                return data;
            },
            set: async (data: { [T in keyof SignalDataTypeMap]?: { [id: string]: SignalDataTypeMap[T] } }) => {
                const pipeline = redis.pipeline();
                for (const category in data) {
                    for (const id in data[category]) {
                        pipeline.set(`${keyPrefix}:${category}:${id}`, JSON.stringify(data[category][id], BufferJSON.replacer));
                    }
                }
                await pipeline.exec();
            },
        },
    };

    const saveCreds = async () => {
        await writeData(credsKey, state.creds);
    };

    return { state, saveCreds };
}