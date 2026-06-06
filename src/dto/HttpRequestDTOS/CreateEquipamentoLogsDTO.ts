export interface CreateEquipamentoLogDTO {
  id_equipamento: number;
  id_metrica: number;
  valor: number;
  id_grupo: number;
  valor_convertido?: number;
  id_equipamento_metrica?: number;
  timestamp?: Date;
  alarme?: boolean;
}

export interface CreateEquipamentoLogsDTO {
  logs: CreateEquipamentoLogDTO[];
}
