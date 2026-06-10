/**
 * Converte uma data para o fuso horário brasileiro (UTC-3)
 * Subtrai 3 horas da data original para converter para o horário brasileiro
 * Exemplo: se a data é 17:00, retorna 14:00
 */
export function toBrazilianTimezone(date: Date): Date {
  // Criar uma cópia da data para não modificar a original
  const brazilianDate = new Date(date);
  
  // Subtrair 3 horas (3 * 60 * 60 * 1000 milissegundos)
  // O fuso horário brasileiro é UTC-3 
  brazilianDate.setHours(brazilianDate.getHours() - 3);
  
  return brazilianDate;
}

export function parseTimestampAsLocal(value: any): Date | null {
  if (!value) return null;
  
  // Se já for Date object, retornar como está
  if (value instanceof Date) {
    return value;
  }
  
  // Se for string, tratar como hora local (sem conversão de timezone)
  if (typeof value === 'string') {
    // Remover 'Z' e timezone se existir (formato ISO UTC)
    let dateStr = value.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
    
    // Substituir 'T' por espaço se existir
    dateStr = dateStr.replace('T', ' ');
    
    // Parse da string no formato "YYYY-MM-DD HH:mm:ss" ou "YYYY-MM-DD HH:mm:ss.sss"
    const parts = dateStr.split(' ');
    if (parts.length === 2) {
      const [datePart, timePart] = parts;
      const [year, month, day] = datePart.split('-').map(Number);
      const timeParts = timePart.split(':');
      const hour = Number(timeParts[0]);
      const minute = Number(timeParts[1]);
      const second = timeParts[2] ? Number(timeParts[2].split('.')[0]) : 0;
      
      // Criar Date no timezone local (sem conversão UTC)
      return new Date(year, month - 1, day, hour, minute, second);
    }
    
    // Fallback: tentar parse direto
    return new Date(value);
  }
  
  return new Date(value);
}

export function formatISOString(value: any): string {
  return value?.toISOString().replace('T', ' ').replace('Z', '').replace(/\.\d{3}$/, '') ?? '';
}


export function formatTimestamp(value: any): string {
  const date = parseTimestampAsLocal(value);
  if (!date || isNaN(date.getTime())) return 'N/A';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

/** "Agora" no mesmo referencial usado ao gravar timestamps de log de equipamento. */
export function getLogReferenceNow(): Date {
  return toBrazilianTimezone(new Date());
}

/** Tempo decorrido (ms) desde um timestamp de log, comparável ao referencial de gravação. */
export function getElapsedMsSinceLogTimestamp(lastLogAt: Date): number {
  return getLogReferenceNow().getTime() - new Date(lastLogAt).getTime();
}

