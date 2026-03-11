export function passkeyAuth(passkey: string | null): boolean {
    const serverPasskey = process.env.PASSKEY;
    if (!serverPasskey) {
        return false;
    }
    return passkey === serverPasskey;
}