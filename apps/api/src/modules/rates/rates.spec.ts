import {
  mergeRates,
  parseEcb,
  parseNbuEur,
  parseStoredRates,
  ratesStale,
  usableRates,
} from './rates';

const ECB = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:subject>Reference rates</gesmes:subject>
	<Cube>
		<Cube time='2026-10-23'>
			<Cube currency='USD' rate='1.1193'/>
			<Cube currency='JPY' rate='175.51'/>
			<Cube currency='PLN' rate='4.3945'/>
		</Cube>
	</Cube>
</gesmes:Envelope>`;

describe('курси валют', () => {
  it('читає денний XML ЄЦБ', () => {
    expect(parseEcb(ECB)).toEqual({
      date: '2026-10-23',
      perEur: { USD: 1.1193, JPY: 175.51, PLN: 4.3945 },
    });
  });

  it('відкидає не той XML', () => {
    expect(parseEcb('<html>maintenance</html>')).toBeNull();
  });

  it('читає EUR/UAH з НБУ', () => {
    const json = [
      {
        r030: 978,
        txt: 'Євро',
        rate: 50.5766,
        cc: 'EUR',
        exchangedate: '26.10.2026',
      },
    ];
    expect(parseNbuEur(json)).toBe(50.5766);
    expect(parseNbuEur([])).toBeNull();
    expect(parseNbuEur({ error: 'x' })).toBeNull();
    expect(parseNbuEur([{ cc: 'EUR', rate: '50' }])).toBeNull();
  });

  it('зводить джерела до курсів за 1 EUR', () => {
    const now = new Date('2026-10-26T10:00:00Z');
    const rates = mergeRates(parseEcb(ECB)!, 50.5766, now);
    expect(rates.perEur).toMatchObject({ EUR: 1, UAH: 50.5766, USD: 1.1193 });
    expect(rates.fetchedAt).toBe('2026-10-26T10:00:00.000Z');
  });

  it('оновлює курси раз на 6 годин', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    expect(ratesStale(null, now)).toBe(true);
    expect(ratesStale({ fetchedAt: '2026-10-26T07:00:00Z' }, now)).toBe(false);
    expect(ratesStale({ fetchedAt: '2026-10-26T05:00:00Z' }, now)).toBe(true);
    expect(ratesStale({ fetchedAt: 'зіпсовано' }, now)).toBe(true);
  });

  it('курси старші за тиждень не використовуються', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    const rates = (fetchedAt: string) => ({
      date: '2026-10-24',
      fetchedAt,
      perEur: { EUR: 1, UAH: 48 },
    });
    expect(usableRates(rates('2026-10-20T12:00:00Z'), now)).not.toBeNull();
    expect(usableRates(rates('2026-10-19T11:00:00Z'), now)).toBeNull();
    expect(usableRates(null, now)).toBeNull();
  });

  it('довіряє лише цілим курсам з Redis', () => {
    const ok = {
      date: '2026-10-23',
      perEur: { EUR: 1, UAH: 50.5 },
      fetchedAt: '2026-10-26T10:00:00Z',
    };
    expect(parseStoredRates(JSON.stringify(ok))).toEqual(ok);
    expect(parseStoredRates(null)).toBeNull();
    expect(parseStoredRates('{')).toBeNull();
    expect(
      parseStoredRates(JSON.stringify({ ...ok, perEur: { UAH: 0 } })),
    ).toBeNull();
  });
});
