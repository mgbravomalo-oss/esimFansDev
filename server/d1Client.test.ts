import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDestinationRowsFromPlans } from './d1Client.ts';

test('agrupa los países de esim_plans en destinos reales', () => {
  const rows = [
    {
      country: 'España',
      country_code: 'ES',
      region: 'europe',
      region_label: 'Europa',
      price_eur: 9.9,
      popular: 1,
    },
    {
      country: 'España',
      country_code: 'ES',
      region: 'europe',
      region_label: 'Europa',
      price_eur: 12.5,
      popular: 0,
    },
    {
      country: 'Estados Unidos',
      country_code: 'US',
      region: 'americas',
      region_label: 'América',
      price_eur: 16.0,
      popular: 1,
    },
  ];

  const destinations = buildDestinationRowsFromPlans(rows);

  assert.equal(destinations.length, 2);
  assert.equal(destinations[0].name, 'España');
  assert.equal(destinations[0].code, 'ES');
  assert.equal(destinations[0].plan_count, 2);
  assert.equal(destinations[0].starting_price_eur, 9.9);
  assert.equal(destinations[1].name, 'Estados Unidos');
  assert.equal(destinations[1].plan_count, 1);
});
