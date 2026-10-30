import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveTuningCapabilities, validateTunePayload } from '../src/services/upgrade-catalog.js';
import { resolveUpgradeProfile } from '../src/services/upgrade-catalog.js';

const profile = {
  basePi: 600,
  baseDriveType: 'rwd',
  commonTemplate: 'combustion_road',
  commonSlotOverrides: { drivetrain_swap: { availability: 'verified_present' } },
  slots: []
};

test('可调能力声明只解锁参数，不推断或写入改装配件', () => {
  const result = resolveTuningCapabilities(profile, {
    suspension: true, frontAntiRollBar: true, transmission: 'gears', gearCount: 7,
    differential: true, driveType: 'awd'
  });
  const ids = result.tuneParameters.map(item => item.id);
  assert.ok(ids.includes('tire_pressure_front'));
  assert.ok(ids.includes('spring_front'));
  assert.ok(ids.includes('arb_front'));
  assert.ok(ids.includes('gear_7'));
  assert.ok(ids.includes('diff_center'));
  assert.ok(!ids.includes('downforce_front'));
});

test('能力清单未勾选的项目保持锁定，胎压始终可调', () => {
  const result = resolveTuningCapabilities(profile, {
    alignment: false,
    springs: 'none',
    antiRollBars: 'none',
    transmission: 'none',
    brakes: false,
    differential: false,
    aero: 'none',
    driveType: 'rwd'
  });
  const ids = result.tuneParameters.map(item => item.id);

  assert.deepEqual(ids, ['tire_pressure_front', 'tire_pressure_rear']);
});

test('能力清单识别前后单独勾选的防倾杆与空气动力项目', () => {
  const result = resolveTuningCapabilities(profile, {
    antiRollBars: 'front_only',
    aero: 'rear_only',
    driveType: 'rwd'
  });
  const ids = result.tuneParameters.map(item => item.id);

  assert.ok(ids.includes('arb_front'));
  assert.ok(!ids.includes('arb_rear'));
  assert.ok(ids.includes('downforce_rear'));
  assert.ok(!ids.includes('downforce_front'));
  assert.ok(!ids.includes('tire_camber_front'));
});

test('保存调校时保留驱动置换和其他有效配件选择', () => {
  const result = validateTunePayload(profile, {
    generationMode: 'manual',
    // 保存时这是当前四驱构型，不是车辆原厂驱动。
    driveType: 'awd',
    totalPi: 700,
    parts: {
      drivetrain_swap: { optionId: 'awd' },
      suspension: { optionId: 'race' },
      differential: { optionId: 'race' },
      transmission: { optionId: 'race_6' },
      tires_compound: { optionId: 'semi_slick' }
    }
  });

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.deepEqual(result.normalizedParts, {
    drivetrain_swap: { optionId: 'awd' },
    suspension: { optionId: 'race' },
    differential: { optionId: 'race' },
    transmission: { optionId: 'race_6' },
    tires_compound: { optionId: 'semi_slick' }
  });
  assert.equal(result.resolved.effectiveDriveType, 'awd');
});

test('游戏实测的完整构型优先返回精确 PI，且不会误用到其它构型', () => {
  const observations = JSON.parse(fs.readFileSync(new URL('../src/config/pi-observations.json', import.meta.url), 'utf8')).observations;
  for (const { vehicleId, confirmedPi, parts } of observations) {
    const profile = {
      ...JSON.parse(fs.readFileSync(new URL(`../src/config/upgrades/${vehicleId}.json`, import.meta.url), 'utf8')),
      id: vehicleId
    };
    const selections = Object.fromEntries(Object.entries(parts).map(([slotId, optionId]) => [slotId, { optionId }]));
    const resolved = resolveUpgradeProfile(profile, selections);
    assert.equal(resolved.prediction.totalPi, confirmedPi);
    assert.equal(resolved.prediction.modelVersion, 'observed-build-v1');
  }
});

test('已核实不存在的配件不会再出现在该车型目录中', () => {
  const profile = {
    ...JSON.parse(fs.readFileSync(new URL('../src/config/upgrades/1081.json', import.meta.url), 'utf8')),
    id: '1081'
  };
  const resolved = resolveUpgradeProfile(profile, {});
  assert.equal(resolved.slots.some(slot => slot.id === 'brakes'), false);
});

test('车型专属空气动力件保留验证范围但显示在空气动力学分组', () => {
  const profile = {
    basePi: 700,
    baseDriveType: 'rwd',
    commonTemplate: 'combustion_road',
    slots: [
      { id: 'front_aero', group: '车辆专属', scope: 'vehicle_specific', replaceCommonOptions: true, options: [{ id: 'stock' }, { id: 'adjustable', adjustable: true }] },
      { id: 'rear_aero', group: '车辆专属', scope: 'vehicle_specific', replaceCommonOptions: true, options: [{ id: 'stock' }, { id: 'adjustable', adjustable: true }] }
    ]
  };
  const resolved = resolveUpgradeProfile(profile, {});

  for (const slotId of ['front_aero', 'rear_aero']) {
    const slot = resolved.slots.find(item => item.id === slotId);
    assert.equal(slot.group, '空气动力学');
    assert.equal(slot.scope, 'vehicle_specific');
  }
});

test('车型专属引擎置换不会混入通用候选引擎', () => {
  const profile = {
    basePi: 600,
    baseDriveType: 'rwd',
    commonTemplate: 'combustion_road',
    slots: [
      {
        id: 'engine_swap',
        group: '车辆专属',
        scope: 'vehicle_specific',
        options: [{ id: 'stock' }, { id: 'engine_vehicle_only', label: '该车专属引擎' }]
      }
    ]
  };

  const engineOptions = resolveUpgradeProfile(profile, {}).slots
    .find(slot => slot.id === 'engine_swap')
    .options
    .map(option => option.id);

  assert.deepEqual(engineOptions, ['stock', 'engine_vehicle_only']);
});

test('未录入专属证据的车辆回退到通用置换，明确不存在时隐藏', () => {
  const genericProfile = { basePi: 600, baseDriveType: 'rwd', commonTemplate: 'combustion_road', slots: [] };
  const generic = resolveUpgradeProfile(genericProfile, {});
  for (const slotId of ['drivetrain_swap', 'aspiration_swap', 'widebody']) {
    assert.ok(generic.slots.find(slot => slot.id === slotId), `${slotId} 应回退到通用候选`);
  }
  const awd = generic.slots.find(slot => slot.id === 'drivetrain_swap').options.find(option => option.id === 'awd');
  assert.equal(awd.piConfidence, 'model_estimate');
  assert.equal(awd.aiEligible, false);

  const unavailable = resolveUpgradeProfile({
    ...genericProfile,
    commonSlotOverrides: {
      drivetrain_swap: { availability: 'verified_absent' },
      aspiration_swap: { availability: 'verified_absent' },
      widebody: { availability: 'verified_absent' }
    }
  }, {});
  for (const slotId of ['drivetrain_swap', 'aspiration_swap', 'widebody']) {
    assert.equal(unavailable.slots.some(slot => slot.id === slotId), false);
  }
});

test('未录入单车Profile的合法车辆能够成功解析通用模版并校验放行', () => {
  const resolved = resolveUpgradeProfile(null, {}, { basePi: 450, driveType: 'rwd' });
  assert.equal(resolved.status, 'ok');
  assert.ok(Array.isArray(resolved.slots));
  assert.ok(resolved.slots.length > 0);

  const validation = validateTunePayload(null, {
    parts: {},
    driveType: 'rwd',
    tires: { frontPressure: 2.0, rearPressure: 2.0 }
  });
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
});

