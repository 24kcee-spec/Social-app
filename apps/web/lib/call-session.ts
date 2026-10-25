import type { CallSignal, PlatformClient } from '@sp/profile-client';

/** WebRTC media stays peer-to-peer or on the configured TURN relay; SDP/ICE is scoped by the RPC. */
export class CallSession {
  private peer: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private cursor = 0;
  private polling = false;
  private closed = false;
  constructor(
    private client: PlatformClient,
    private id: string,
    private events: {
      local: (stream: MediaStream) => void;
      remote: (stream: MediaStream) => void;
      state: (state: string) => void;
      error: (error: unknown) => void;
    },
  ) {}
  async prepare(
    mode: 'audio' | 'video',
    configuration: { iceServers: RTCIceServer[]; relay: boolean },
  ) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
    });
    if (this.closed) {
      this.stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.events.local(this.stream);
    this.peer = new RTCPeerConnection({
      iceServers: configuration.iceServers,
      iceTransportPolicy: configuration.relay ? 'relay' : 'all',
    });
    this.stream.getTracks().forEach((track) => this.peer!.addTrack(track, this.stream!));
    this.peer.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) this.events.remote(stream);
    };
    this.peer.onconnectionstatechange = () =>
      this.events.state(this.peer?.connectionState ?? 'closed');
    this.peer.onicecandidate = (event) => {
      if (event.candidate && !this.closed)
        void this.client
          .signalCall(this.id, 'ice', event.candidate.toJSON())
          .catch(this.events.error);
    };
  }
  async offer() {
    if (!this.peer) throw new Error('Media is not ready.');
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    await this.client.signalCall(this.id, 'offer', offer);
  }
  async poll() {
    if (this.polling || this.closed || !this.peer) return;
    this.polling = true;
    try {
      const signals = await this.client.getCallSignals(this.id, this.cursor);
      for (const signal of signals) {
        if (this.closed) break;
        await this.handle(signal);
        this.cursor = Math.max(this.cursor, signal.id);
      }
    } catch (error) {
      if (!this.closed) this.events.error(error);
    } finally {
      this.polling = false;
    }
  }
  private async handle(signal: CallSignal) {
    const peer = this.peer!;
    if (signal.kind === 'ice') {
      if (peer.remoteDescription) await peer.addIceCandidate(signal.payload as RTCIceCandidateInit);
      else this.pendingIce.push(signal.payload as RTCIceCandidateInit);
      return;
    }
    const description = signal.payload as RTCSessionDescriptionInit;
    if (signal.kind === 'offer') {
      await peer.setRemoteDescription(description);
      await this.flushIce();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await this.client.signalCall(this.id, 'answer', answer);
    } else if (signal.kind === 'answer' && peer.signalingState === 'have-local-offer') {
      await peer.setRemoteDescription(description);
      await this.flushIce();
    }
  }
  private async flushIce() {
    for (const ice of this.pendingIce) await this.peer!.addIceCandidate(ice);
    this.pendingIce = [];
  }
  mute(muted: boolean) {
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }
  camera(enabled: boolean) {
    this.stream?.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }
  close() {
    this.closed = true;
    this.peer?.close();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.peer = null;
    this.stream = null;
    this.pendingIce = [];
  }
}
