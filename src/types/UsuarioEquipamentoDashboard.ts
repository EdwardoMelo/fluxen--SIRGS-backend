import { Equipamento } from "./Equipamento";
import { Usuario } from "./Usuario";
import { Metrica } from "./Metrica";
import { TipoGrafico } from "./TipoGrafico";

export interface UsuarioEquipamentoDashboard {
  id: number;
  id_tenant?: number | null;
  id_usuario: number;
  id_equipamento: number;
  id_metrica?: number | null;
  id_tipo_grafico?: number | null;
  created_at?: Date | null;
  usuario?: Usuario;
  equipamento?: Equipamento;
  metrica?: Metrica;
  tipo_grafico?: TipoGrafico;
}


