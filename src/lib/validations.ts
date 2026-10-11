import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const eventCreateSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, { message: "O título é obrigatório." })
      .max(120, { message: "O título deve ter no máximo 120 caracteres." }),
    description: z
      .string()
      .trim()
      .max(500, { message: "A descrição deve ter no máximo 500 caracteres." })
      .optional()
      .or(z.literal("")),
    // Data no formato ISO "yyyy-MM-dd"
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data inválida." }),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data de término inválida." })
      .optional()
      .or(z.literal("")),
    allDay: z.boolean().default(true),
    startTime: z.string().regex(timeRegex).optional().nullable(),
    endTime: z.string().regex(timeRegex).optional().nullable(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, { message: "Cor inválida." })
      .default("#3b82f6"),
  })
  .refine(
    (data) => {
      if (data.allDay) return true;
      return Boolean(data.startTime) && Boolean(data.endTime);
    },
    {
      message: "Informe horário de início e fim para eventos com hora.",
      path: ["startTime"],
    },
  )
  .refine(
    (data) => {
      if (data.allDay || !data.startTime || !data.endTime) return true;
      return data.startTime < data.endTime;
    },
    {
      message: "O horário final deve ser depois do inicial.",
      path: ["endTime"],
    },
  )
  .refine(
    (data) => {
      if (!data.endDate) return true;
      return data.endDate >= data.date;
    },
    {
      message: "A data de término não pode ser anterior à data de início.",
      path: ["endDate"],
    },
  );

export const eventUpdateSchema = eventCreateSchema;

export type EventInput = z.infer<typeof eventCreateSchema>;
