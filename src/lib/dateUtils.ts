/**
 * Utilitários centralizados de data e fuso horário para o IATF Master SaaS.
 * 
 * Fuso horário padrão: 'America/Sao_Paulo' (Horário de Brasília, UTC-03:00).
 * Garante que a virada de data ocorra pontualmente às 00:00 (meia-noite) no horário de Brasília,
 * evitando o bug clássico de virada antecipada às 21:00 UTC-3 que acontece ao usar `new Date().toISOString().split('T')[0]`.
 */

export const TIMEZONE_BRASILIA = 'America/Sao_Paulo';

/**
 * Retorna a data atual (ou de um objeto Date específico) formatada como 'YYYY-MM-DD'
 * considerando o fuso horário oficial (padrão: Horário de Brasília).
 * Vira apenas após as 00:00hs locais.
 */
export function getTodayDateString(
  date: Date = new Date(),
  timeZone: string = TIMEZONE_BRASILIA
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Converte qualquer Date para 'YYYY-MM-DD' no fuso horário especificado.
 */
export function formatDateToLocalISO(
  date: Date,
  timeZone: string = TIMEZONE_BRASILIA
): string {
  return getTodayDateString(date, timeZone);
}

/**
 * Adiciona ou subtrai dias de uma string de data 'YYYY-MM-DD' de forma estritamente
 * de calendário (aritmética pura de dias), imune a shifts de fuso horário e horário de verão.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  if (!dateStr) return '';
  const cleanDate = dateStr.slice(0, 10);
  const [year, month, day] = cleanDate.split('-').map(Number);
  if (!year || !month || !day) return dateStr;

  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().split('T')[0];
}

/**
 * Formata com segurança uma data ou string de data para o formato brasileiro 'DD/MM/YYYY'.
 * Trata strings 'YYYY-MM-DD' sem subtrair 1 dia devido ao offset UTC.
 */
export function formatDateBR(
  dateOrStr?: string | Date | null,
  timeZone: string = TIMEZONE_BRASILIA
): string {
  if (!dateOrStr) return '-';

  if (typeof dateOrStr === 'string') {
    const trimmed = dateOrStr.trim();
    // Se for formato simples YYYY-MM-DD (sem hora), divide diretamente para evitar shift de fuso
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-');
      return `${day}/${month}/${year}`;
    }
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', { timeZone }).format(parsed);
  }

  if (isNaN(dateOrStr.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', { timeZone }).format(dateOrStr);
}

/**
 * Formata data e hora para exibição amigável em pt-BR (ex: 02/10/2026 às 15:30)
 * no fuso horário de Brasília.
 */
export function formatDateTimeBR(
  dateOrStr?: string | Date | null,
  timeZone: string = TIMEZONE_BRASILIA
): string {
  if (!dateOrStr) return '-';
  const d = typeof dateOrStr === 'string' ? new Date(dateOrStr) : dateOrStr;
  if (isNaN(d.getTime())) return '-';

  const datePart = new Intl.DateTimeFormat('pt-BR', { timeZone }).format(d);
  const timePart = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);

  return `${datePart} às ${timePart}`;
}

/**
 * Retorna o timestamp ISO em UTC para persistência nos campos `created_at` e `updated_at`.
 */
export function getNowISOString(): string {
  return new Date().toISOString();
}
