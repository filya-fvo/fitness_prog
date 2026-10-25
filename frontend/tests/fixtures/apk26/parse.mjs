import { readFileSync } from 'node:fs';
import { offlineWorkoutContextSchema, parseCachedPlans } from './schemas.mjs';
const input = JSON.parse(readFileSync(0, 'utf8'));
const bundle = offlineWorkoutContextSchema.parse(input);
const plans = process.argv[2] === 'online' ? bundle.plans : parseCachedPlans(input);
process.stdout.write(JSON.stringify({ ...bundle, plans }));
