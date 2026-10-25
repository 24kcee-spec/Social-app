import { afterEach, describe, it, expect, vi } from 'vitest';
import type { PlatformClient } from '@sp/profile-client';
import { CallSession } from '../lib/call-session';
afterEach(() => {
  vi.unstubAllGlobals();
});
function setup() {
  const stop = vi.fn();
  const track = { stop, enabled: true };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
    getVideoTracks: () => [],
  };
  let peer: FakePeer;
  class FakePeer {
    connectionState = 'new';
    onconnectionstatechange: (() => void) | null = null;
    ontrack: unknown;
    onicecandidate: unknown;
    addTrack = vi.fn();
    close = vi.fn();
    constructor() {
      peer = this;
    }
  }
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } });
  vi.stubGlobal('RTCPeerConnection', FakePeer);
  const client = {
    getCallSignals: vi.fn(async () => []),
    setCallState: vi.fn(async () => ({ updated: true })),
  };
  const events = { local: vi.fn(), remote: vi.fn(), state: vi.fn(), error: vi.fn() };
  const session = new CallSession(client as unknown as PlatformClient, 'room', events);
  return { session, client, events, stop, peer: () => peer! };
}
describe('call capture lifecycle', () => {
  it('stops camera/microphone capture when signaling authorization is revoked', async () => {
    const s = setup();
    await s.session.prepare('audio', { iceServers: [], relay: false });
    s.client.getCallSignals.mockRejectedValueOnce(
      Object.assign(new Error('revoked'), { status: 403 }),
    );
    await s.session.poll();
    expect(s.stop).toHaveBeenCalledTimes(1);
    expect(s.peer().close).toHaveBeenCalledTimes(1);
    expect(s.events.state).toHaveBeenCalledWith('ended');
  });
  it('preserves an established call through a transient signaling outage', async () => {
    const s = setup();
    await s.session.prepare('audio', { iceServers: [], relay: false });
    s.client.getCallSignals.mockRejectedValueOnce(
      Object.assign(new Error('temporary'), { status: 503 }),
    );
    await s.session.poll();
    expect(s.stop).not.toHaveBeenCalled();
    s.session.close();
    s.session.close();
    expect(s.stop).toHaveBeenCalledTimes(1);
  });
  it('tears down media and ends the room after a terminal peer failure', async () => {
    const s = setup();
    await s.session.prepare('audio', { iceServers: [], relay: false });
    s.peer().connectionState = 'failed';
    s.peer().onconnectionstatechange?.();
    expect(s.stop).toHaveBeenCalledTimes(1);
    expect(s.client.setCallState).toHaveBeenCalledWith('room', 'ended');
    expect(s.events.state).toHaveBeenCalledWith('ended');
  });
});
