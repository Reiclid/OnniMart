import { linearTicks, logTicks, ratioLabel, shortNumber } from "./quality";

describe("logTicks", () => {
  it("1, 2, 5 у межах", () => {
    expect(logTicks(0.8, 30)).toEqual([1, 2, 5, 10, 20]);
  });
  it("широкий діапазон — лише степені 10", () => {
    expect(logTicks(0.01, 100000)).toEqual([
      0.01, 0.1, 1, 10, 100, 1000, 10000, 100000,
    ]);
  });
});

describe("shortNumber / ratioLabel", () => {
  it("коротко й з комою", () => {
    expect(shortNumber(0.0512)).toBe("0,0512");
    expect(shortNumber(2.5)).toBe("2,5");
    expect(shortNumber(1234)).toBe("1234");
    expect(shortNumber(25000)).toBe("25 тис.");
    expect(shortNumber(2_000_000)).toBe("2 млн");
    expect(ratioLabel(1.189207)).toBe("×1,19");
    expect(ratioLabel(0.5)).toBe("×0,5");
  });
});

describe("linearTicks", () => {
  it("круглий крок", () => {
    expect(linearTicks(0, 100)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(linearTicks(-25, 90)).toEqual([-20, 0, 20, 40, 60, 80]);
  });
});
