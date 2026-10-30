import { test, expect } from '@playwright/test';
import { createQualityPolicy } from '../src/quality-policy';

test('constrained hardware starts economically without treating every phone or high-resolution screen as slow', () => {
  expect(createQualityPolicy({ deviceMemory: 2, hardwareConcurrency: 8 }).initialLow).toBe(true);
  expect(createQualityPolicy({ deviceMemory: 4, hardwareConcurrency: 2 }).initialLow).toBe(true);
  expect(createQualityPolicy({ saveData: true }).initialLow).toBe(true);
  expect(createQualityPolicy({ deviceMemory: 4, hardwareConcurrency: 8 }).initialLow).toBe(false);
  expect(createQualityPolicy({ deviceMemory: 0, hardwareConcurrency: 0 }).initialLow).toBe(false);
  expect(createQualityPolicy().initialLow).toBe(false);
});

test('one compilation or resize stall and a stable 30 fps entry do not reduce quality', () => {
  const policy = createQualityPolicy();
  expect(policy.sample(800)).toBe(false);
  for (let i = 0; i < 90; i++) expect(policy.sample(1000 / 30)).toBe(false);
  expect(policy.sample(200, { eligible: false })).toBe(false);
  for (let i = 0; i < 60; i++) expect(policy.sample(1000 / 60)).toBe(false);
  expect(policy.low).toBe(false);
});

test('sustained poor rendering reduces quality once, after warmup', () => {
  const policy = createQualityPolicy();
  for (let i = 0; i < 24; i++) expect(policy.sample(80)).toBe(false);
  const decisions = Array.from({ length: 100 }, () => policy.sample(80));
  expect(decisions.filter(Boolean)).toHaveLength(1);
  expect(policy.low).toBe(true);
});

test('continuously severe frames adapt while an isolated long task does not', () => {
  const policy = createQualityPolicy();
  for (let i = 0; i < 7; i++) expect(policy.sample(500)).toBe(false);
  expect(policy.sample(16)).toBe(false);
  for (let i = 0; i < 7; i++) expect(policy.sample(500)).toBe(false);
  expect(policy.sample(500)).toBe(true);
  expect(policy.sample(500)).toBe(false);
});

test('a manual choice overrides automatic decisions and returning to auto starts fresh', () => {
  const policy = createQualityPolicy();
  policy.setManual(false);
  for (let i = 0; i < 100; i++) expect(policy.sample(100)).toBe(false);
  expect(policy.low).toBe(false);
  policy.setManual(true);
  expect(policy.low).toBe(true);
  policy.setManual();
  expect(policy.low).toBe(false);
  for (let i = 0; i < 24; i++) expect(policy.sample(100)).toBe(false);
  expect(Array.from({ length: 60 }, () => policy.sample(100)).some(Boolean)).toBe(true);
});
