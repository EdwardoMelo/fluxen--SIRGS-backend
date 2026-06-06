import { Metrica } from "./Metrica";

export interface EquipamentoMetrica {
  id: number;
  id_equipamento: number;
  id_metrica: number;
  valor_minimo: number;
  valor_maximo: number;
  alarme_minimo?: number | null;
  alarme_maximo?: number | null;
  texto_alarme?: string | null;
  metrica?: Metrica;
}
