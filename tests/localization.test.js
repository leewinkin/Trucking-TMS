import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const dictionaries = {
  zh: parseDictionary("zh"),
  en: parseDictionary("en")
};

assert.deepEqual(findDuplicateKeys("zh"), [], "Chinese translation source should not contain duplicate keys");
assert.deepEqual(findDuplicateKeys("en"), [], "English semantic translation source should not contain duplicate keys");

assert.equal(translate("zh", "action.close"), "关闭", "Chinese modal Close action should render 关闭");
assert.equal(translate("zh", "business.openingTime"), "营业开始时间", "company opening label should render 营业开始时间");
assert.equal(translate("zh", "business.closingTime"), "营业结束时间", "company closing label should render 营业结束时间");
assert.equal(translate("zh", "invoice.status.open"), "未结清", "invoice Open status should render 未结清");
assert.equal(translate("zh", "shipment.filter.active"), "运输中", "shipment Active filter should render 运输中");
assert.equal(translate("zh", "account.status.active"), "启用", "customer account Active status should render 启用");
assert.equal(translate("zh", "document.status.pending"), "待生成", "document Pending status should render 待生成");
assert.equal(translate("zh", "operation.status.pending"), "待处理", "operational Pending status should render 待处理");
assert.equal(translate("en", "action.close"), "Close", "English semantic close fallback should not expose the semantic key");
assert.equal(translate("en", "Book Shipment"), "Book Shipment", "ordinary English UI keys should remain unchanged");

assert.equal(translate("zh", "Ready to Book"), "可预约运输");
assert.equal(translate("zh", "Ready to Book KPI"), "可预约运输报价");
assert.equal(translate("zh", "Book Shipment"), "预约运输");
assert.equal(translate("zh", "Confirm Booking"), "确认预约");
assert.equal(translate("zh", "Online booking"), "在线预约运输");
assert.equal(translate("zh", "Shipment"), "货件");
assert.equal(translate("zh", "Shipments"), "货件");
assert.equal(translate("zh", "My Shipments"), "我的货件");
assert.equal(translate("zh", "Available Rates"), "可用运价");
assert.equal(translate("zh", "No Rates"), "暂无可用运价");
assert.equal(translate("zh", "Get Rates"), "获取运价");
assert.equal(translate("zh", "Tariff Rule"), "客户加价规则");
assert.equal(translate("zh", "Freight class"), "货运等级");
assert.equal(translate("zh", "Payload"), "原始数据");
assert.equal(translate("zh", "View Payload"), "查看原始数据");
assert.equal(translate("zh", "Healthy"), "正常");
assert.equal(translate("zh", "Degraded"), "部分异常");

assert.equal(app.includes("订舱"), false, "customer-facing Chinese translation source should not contain 订舱");
assert.equal(app.includes("\"Close\": \"下班时间\""), false, "generic Close should not render as business closing time");
assert.match(html, /id="modalCloseButton"[\s\S]*data-i18n="action\.close"/, "modal close button should use action.close semantic key");
assert.match(html, /name="companyOpenTime"[\s\S]*data-i18n="business\.closingTime"/, "company hours labels should use business semantic keys");
assert.match(app, /const englishDictionary = translations\.en \|\| \{\};/, "translation helper should include English semantic fallback");
assert.match(app, /quotes: isCustomer \? "My Quotes" : "Quote Management"/, "customer and staff role presentation should remain separated");

const staticKeys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]);
const missingStaticKeys = [...new Set(staticKeys)].filter((key) => !dictionaries.zh.has(key) && !dictionaries.en.has(key));
assert.deepEqual(missingStaticKeys, [], "all static data-i18n keys should have a Chinese translation or semantic English fallback");

console.log("localization tests passed");

function translate(language, key, params = {}) {
  const translated = dictionaries[language].get(key) || dictionaries.en.get(key) || key;
  return translated.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

function parseDictionary(language) {
  return new Map(parseEntries(language));
}

function findDuplicateKeys(language) {
  const seen = new Set();
  const duplicates = [];
  for (const [key] of parseEntries(language)) {
    if (seen.has(key)) {
      duplicates.push(key);
    } else {
      seen.add(key);
    }
  }
  return duplicates;
}

function parseEntries(language) {
  const block = extractDictionaryBlock(language);
  const entries = [];
  const pattern = /^\s{4}"((?:[^"\\]|\\.)+)"\s*:\s*"((?:[^"\\]|\\.)*)",?/gm;
  let match;
  while ((match = pattern.exec(block))) {
    entries.push([JSON.parse(`"${match[1]}"`), JSON.parse(`"${match[2]}"`)]);
  }
  return entries;
}

function extractDictionaryBlock(language) {
  const marker = `  ${language}: {`;
  const start = app.indexOf(marker);
  assert.notEqual(start, -1, `${language} translation dictionary should exist`);
  let depth = 0;
  for (let index = start + marker.length - 1; index < app.length; index += 1) {
    const char = app[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return app.slice(start, index + 1);
      }
    }
  }
  throw new Error(`${language} translation dictionary block was not closed`);
}
