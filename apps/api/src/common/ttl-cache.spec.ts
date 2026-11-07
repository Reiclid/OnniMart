import { ttlCached } from './ttl-cache';

describe('ttlCached', () => {
  it('віддає збережене, поки не минув термін, і оновлює після нього', async () => {
    let time = 0;
    let calls = 0;
    const load = jest.fn(async () => ++calls);
    const get = ttlCached(1000, load, () => time);

    expect(await get()).toBe(1);
    time = 999;
    expect(await get()).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);

    time = 1000;
    expect(await get()).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('одночасні виклики ділять один запит', async () => {
    const load = jest.fn(async () => 'x');
    const get = ttlCached(1000, load);
    await Promise.all([get(), get(), get()]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('не кешує збій', async () => {
    const load = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error('БД лягла'))
      .mockResolvedValueOnce('ok');
    const get = ttlCached(1000, load);
    await expect(get()).rejects.toThrow('БД лягла');
    expect(await get()).toBe('ok');
  });
});
