import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_COUNTRY_CODES } from "@/lib/countries";
import {
  ALPHA3_BY_ALPHA2,
  countryAlpha3,
  formatIssuingCountryForBank,
} from "@/lib/country-alpha3";

describe("alpha-3 table", () => {
  it("covers exactly the codes the rest of the app knows", () => {
    const keys = Object.keys(ALPHA3_BY_ALPHA2).sort();
    const known = [...ALL_COUNTRY_CODES].sort();
    assert.deepEqual(keys, known);
  });

  it("maps every code to a unique three-letter alpha-3", () => {
    const values = Object.values(ALPHA3_BY_ALPHA2);
    for (const value of values) assert.match(value, /^[A-Z]{3}$/);
    assert.equal(new Set(values).size, values.length);
  });

  it("gets the countries a passport proxy is most likely to come from right", () => {
    assert.equal(countryAlpha3("SG"), "SGP");
    assert.equal(countryAlpha3("ID"), "IDN");
    assert.equal(countryAlpha3("IN"), "IND");
    assert.equal(countryAlpha3("PH"), "PHL");
    assert.equal(countryAlpha3("BD"), "BGD");
    assert.equal(countryAlpha3("MY"), "MYS");
    assert.equal(countryAlpha3("gb"), "GBR");
    assert.equal(countryAlpha3("XX"), null);
    assert.equal(countryAlpha3(null), null);
  });
});

describe("formatIssuingCountryForBank", () => {
  it("reads the way the bank's Issuing Country select does", () => {
    assert.equal(formatIssuingCountryForBank("SG"), "SGP - SINGAPORE");
    assert.equal(formatIssuingCountryForBank("my"), "MYS - MALAYSIA");
  });

  it("is empty when there is no country", () => {
    assert.equal(formatIssuingCountryForBank(null), "");
    assert.equal(formatIssuingCountryForBank(""), "");
  });
});
