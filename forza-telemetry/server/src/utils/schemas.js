import { z } from 'zod';

// 保存/修改调校的 API Schema
export const saveTuneSchema = z.object({
  name: z.string().min(1, '方案名称不能为空'),
  vehicleId: z.any().nullable().optional(),
  description: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
  carOrdinal: z.any().nullable().optional(),
  generationMode: z.enum(['ai', 'manual', 'assisted']).optional().default('manual'),
  raceType: z.string().nullable().optional(),
  segmentType: z.string().nullable().optional(),
  driveType: z.enum(['fwd', 'rwd', 'awd']).nullable().optional(),
  targetPi: z.number().nullable().optional(),
  totalPi: z.number().nullable().optional(),
  piConfirmed: z.boolean().optional().default(false),
  basePi: z.number().nullable().optional(),
  freeMode: z.boolean().optional(),
  notes: z.string().optional().default(''),
  tires: z.any().nullable().optional(),
  suspension: z.any().nullable().optional(),
  drivetrain: z.any().nullable().optional(),
  brakes: z.any().nullable().optional(),
  aero: z.any().nullable().optional(),
  parts: z.record(z.any()).optional().default({}),
  tuningCapabilities: z.record(z.any()).nullable().optional()
});

// Zod 异常格式化 Helper
export function formatZodError(error) {
  const issues = error?.issues || error?.errors;
  if (Array.isArray(issues)) {
    return issues.map(err => `${Array.isArray(err.path) ? err.path.join('.') : err.path}: ${err.message}`);
  }
  return [error?.message || '数据格式校验失败'];
}
