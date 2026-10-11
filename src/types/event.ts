export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  /** Data de início no formato "yyyy-MM-dd". */
  date: string;
  /** Data de término no formato "yyyy-MM-dd" (null = evento de um único dia). */
  endDate: string | null;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  color: string;
}

export interface EventFormValues {
  title: string;
  description: string;
  date: string; // yyyy-MM-dd (início)
  endDate: string; // yyyy-MM-dd (término)
  allDay: boolean;
  startTime: string;
  endTime: string;
  color: string;
}
