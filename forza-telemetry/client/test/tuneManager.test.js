import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffectiveDriveType, useTuneManager } from '../src/hooks/useTuneManager.js';
import { saveTuneSchema } from '../../server/src/utils/schemas.js';

// Setup minimal DOM environment required for React 18 rendering
class MockElement {
  constructor(nodeName) {
    this.nodeName = nodeName.toUpperCase();
    this.tagName = nodeName.toUpperCase();
    this.nodeType = 1;
    this.childNodes = [];
    this.style = {};
    this.ownerDocument = globalThis.document;
  }
  appendChild(child) { child.parentNode = this; this.childNodes.push(child); return child; }
  removeChild(child) { this.childNodes = this.childNodes.filter(c => c !== child); return child; }
  insertBefore(child) { child.parentNode = this; this.childNodes.push(child); return child; }
  addEventListener() {}
  removeEventListener() {}
}

const mockDoc = {
  nodeType: 9,
  createElement: (name) => new MockElement(name),
  createElementNS: (ns, name) => new MockElement(name),
  createTextNode: (text) => ({ text, nodeType: 3, ownerDocument: globalThis.document }),
  addEventListener: () => {},
  removeEventListener: () => {}
};
mockDoc.body = new MockElement('body');
mockDoc.ownerDocument = mockDoc;

globalThis.document = mockDoc;
globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class HTMLIFrameElement {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

test('useTuneManager startEdit loads saved parameters and refreshUpgradeShop preserves populated saved fields', async () => {
  const originalFetch = globalThis.fetch;

  // Mock fetch responses for API calls made by useTuneManager
  globalThis.fetch = async (url) => {
    if (url === '/api/tunes' || url === '/api/tracks' || url === '/api/sessions') {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url === '/api/vehicles') {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (url === '/api/vehicles/catalog') {
      return new Response(JSON.stringify([{ ordinal: '101', name: 'Test Car', basePi: 500 }]), { status: 200 });
    }
    if (url.startsWith('/api/vehicles/101/upgrades')) {
      return new Response(JSON.stringify({
        status: 'verified',
        basePi: 500,
        targetPi: 800,
        effectiveSelections: { suspension: { tier: 'race' } },
        tuneParameters: [
          { id: 'tire_pressure_front', range: { min: 1.5, max: 3.5 } },
          { id: 'spring_front', range: { min: 20, max: 150 } }
        ]
      }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  try {
    let tuneManager;
    function TestComponent() {
      tuneManager = useTuneManager({});
      return null;
    }

    const container = new MockElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(React.createElement(TestComponent));
    });

    const savedTune = {
      id: 'tune-999',
      name: 'Saved Custom Tune',
      vehicleId: '101',
      basePi: 500,
      targetPi: 800,
      totalPi: 750,
      generationMode: 'manual',
      parts: { suspension: { tier: 'race' } },
      tires: { frontPressure: 2.35, rearPressure: 2.45 },
      suspension: { frontSpring: 92.0, rearSpring: 78.5 },
      drivetrain: { finalDrive: 3.55 },
      brakes: { balance: 53 },
      aero: { frontDownforce: 115 }
    };

    // Trigger startEdit on the actual useTuneManager hook
    await act(async () => {
      tuneManager.startEdit(savedTune);
    });

    // Wait for async refreshUpgradeShop triggered by vehicleId effect to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Assert that the hook's formData retains saved parameters and was not overwritten by recommendations
    assert.equal(tuneManager.formData.name, 'Saved Custom Tune');
    assert.equal(tuneManager.formData.vehicleId, '101');
    assert.equal(tuneManager.formData.tires.frontPressure, 2.35);
    assert.equal(tuneManager.formData.tires.rearPressure, 2.45);
    assert.equal(tuneManager.formData.suspension.frontSpring, 92.0);
    assert.equal(tuneManager.formData.suspension.rearSpring, 78.5);
    assert.equal(tuneManager.formData.drivetrain.finalDrive, 3.55);
    assert.equal(tuneManager.formData.brakes.balance, 53);
    assert.equal(tuneManager.formData.aero.frontDownforce, 115);

    act(() => {
      root.unmount();
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolves stock drivetrain_swap option to effective drive type (fwd/rwd/awd) rather than stock', async () => {
  const mockParts = {
    drivetrain_swap: { optionId: 'stock' },
    engine_swap: { optionId: 'stock' }
  };

  const shop = { effectiveDriveType: 'rwd', baseDriveType: 'rwd' };
  const vehicle = { drivetrain: 'RWD' };

  const driveTypePayload = resolveEffectiveDriveType(mockParts, 'rwd', shop, vehicle);
  assert.equal(driveTypePayload, 'rwd');

  // Verify that resolved payload satisfies saveTuneSchema
  const tunePayload = {
    name: 'Test Tune',
    vehicleId: '101',
    basePi: 500,
    totalPi: 600,
    generationMode: 'manual',
    driveType: driveTypePayload,
    parts: mockParts
  };

  const validation = saveTuneSchema.safeParse(tunePayload);
  assert.equal(validation.success, true);

  // Verify schema rejects 'stock' as driveType
  const invalidPayload = { ...tunePayload, driveType: 'stock' };
  const invalidValidation = saveTuneSchema.safeParse(invalidPayload);
  assert.equal(invalidValidation.success, false);
});
