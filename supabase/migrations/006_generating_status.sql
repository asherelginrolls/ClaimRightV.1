-- Migration 006: Add 'generating' to cases.status constraint
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run)
-- Idempotent: safe to run multiple times.
--
-- This adds a transitional 'generating' state so the download polling route
-- can claim letter generation atomically and prevent duplicate generation
-- when multiple polls fire while the letter is being produced.

ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_status_check;

ALTER TABLE cases ADD CONSTRAINT cases_status_check
  CHECK (status IN (
    'uploaded',
    'analysed',
    'paid',
    'generating',
    'generated',
    'delivered'
  ));
