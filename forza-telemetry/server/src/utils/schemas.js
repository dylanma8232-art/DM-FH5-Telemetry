import { z } from 'zod';

// 调校参数嵌套结构校验
export const tuneParamSchema = z.object({
  frontPressure: z.number().nullable().optional(),
  rearPressure: z.number().nullable().optional(),
  frontCamber: z.number().nullable().optional(),
  rearCamber: z.number().nullable().optional(),
  frontToe: z.number().nullable().optional(),
  rearToe: z.number().nullable().optional(),
  frontCaster: z.number().nullable().optional(),
  frontSpring: z.number().nullable().optional(),
  rearSpring: z.number().nullable().optional(),
  frontDamping: z.number().nullable().optional(),
  rearDamping: z.number().nullable().optional(),
  frontRebound: z.number().nullable().optional(),
  rearRebound: z.number().nullable().optional(),
  frontBump: z.number().nullable().optional(),
  rearBump: z.number().nullable().optional(),
  frontARB: z.number().nullable().optional(),
  rearARB: z.number().nullable().optional(),
  frontRideHeight: z.number().nullable().optional(),
  rearRideHeight: z.number().nullable().optional(),
  frontDiffAccel: z.number().nullable().optional(),
  frontDiffDecel: z.number().nullable().optional(),
  rearDiffAccel: z.number().nullable().optional(),
  rearDiffDecel: z.number().nullable().optional(),
  diffCenter: z.number().nullable().optional(),
  finalDrive: z.number().nullable().optional(),
  balance: z.number().nullable().optional(),
  pressure: z.number().nullable().optional(),
  frontDownforce: z.number().nullable().optional(),
  rearDownforce: z.number().nullable().optional()
}).catchall(z.any());

// 保存/修改调校的 API Schema
export const saveTuneSchema = z.object({
  name: z.string().min(1, '方案名称不能为空'),
  vehicleId: z.any().nullable().optional(),
  description: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
  carOrdinal: z.any().nullable().optional(),
  generationMode: z.enum(['ai', 'manual']).optional().default('manual'),
  raceType: z.string().nullable().optional(),
  driveType: z.enum(['fwd', 'rwd', 'awd']).nullable().optional(),
  targetPi: z.number().nullable().optional(),
  totalPi: z.number().nullable().optional(),
  basePi: z.number().nullable().optional(),
  freeMode: z.boolean().optional(),
  notes: z.string().optional().default(''),
  tires: z.any().nullable().optional(),
  suspension: z.any().nullable().optional(),
  drivetrain: z.any().nullable().optional(),
  brakes: z.any().nullable().optional(),
  aero: z.any().nullable().optional(),
  parts: z.record(z.any()).optional().default({})
});

// Zod 异常格式化 Helper
export function formatZodError(error) {
  return error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
}
