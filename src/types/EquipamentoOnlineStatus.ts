export interface EquipamentoOnlineStatus {
  isOnline: boolean;
  lastLogAt: string | null;
  timeoutOnlineSegundos: number;
  latencyBufferSegundos: number;
  effectiveTimeoutSegundos: number;
}
