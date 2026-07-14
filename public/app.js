import { carrierStatusLine, pickupTimeErrorCodes, validatePickupReadyWindow } from "./quote-time-validation.js";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const languageKey = "tms-language";
const freightUnitsKey = "tms-freight-units";
const translations = {
  zh: {
    "Shipment Desk": "货运工作台",
    "Language": "语言",
    "Trucking TMS": "卡车运输 TMS",
    "Employee sign in": "员工登录",
    "Operations portal": "运营门户",
    "Email or username": "邮箱或用户名",
    "Password": "密码",
    "Sign In": "登录",
    "Need access?": "需要权限？",
    "Sign in with your company employee account.": "使用你的公司员工账号登录。",
    "Checking server": "正在检查服务器",
    "Dashboard": "仪表盘",
    "Customers": "客户",
    "New Quote": "新建报价",
    "Shipments": "发运",
    "Invoices": "发票",
    "Invoice": "发票",
    "Edit": "编辑",
    "Logout": "退出登录",
    "Refresh": "刷新",
    "Watch quote activity, shipment status, and invoice drafts.": "查看报价动态、发运状态和发票草稿。",
    "Track your quotes, shipments, and invoices.": "跟踪你的报价、发运和发票。",
    "Manage customer accounts and tariff rules.": "管理客户账户和费率规则。",
    "Review local bookings and carrier shipment references.": "查看本地预订和承运商发运引用。",
    "See draft invoices created from booked shipments.": "查看根据已预订发运创建的发票草稿。",
    "Your Account": "你的账户",
    "My Quotes": "我的报价",
    "My Shipments": "我的发运",
    "My Invoices": "我的发票",
    "Draft invoices": "发票草稿",
    "Recent Shipments": "最近发运",
    "Next Setup Steps": "下一步设置",
    "Add real customers.": "添加真实客户。",
    "Set customer markup rules.": "设置客户加价规则。",
    "Add your SpeedShip LTL sandbox credentials to backend env.": "将 SpeedShip LTL 沙箱凭证添加到后端环境变量。",
    "Add your Mothership sandbox token to backend env.": "将 Mothership 沙箱令牌添加到后端环境变量。",
    "Run one LTL sandbox quote before expanding carrier options.": "在扩展承运商选项前先跑一次 LTL 沙箱报价。",
    "Run one sandbox quote before enabling carrier booking.": "在启用承运商预订前先跑一次沙箱报价。",
    "Customer Accounts": "客户账户",
    "Company name": "公司名称",
    "Billing email": "账单邮箱",
    "Payment terms": "付款条款",
    "Company phone": "公司电话",
    "Company street": "公司地址",
    "Company city": "公司城市",
    "Company state": "公司州",
    "Company ZIP": "公司邮编",
    "Open": "上班时间",
    "Close": "下班时间",
    "No billing email": "无账单邮箱",
    "No portal user": "无门户用户",
    "Your account": "你的账户",
    "Select a customer": "选择客户",
    "Book after quote": "报价后预订",
    "Quote only": "仅报价",
    "Carrier mode": "承运商模式",
    "None": "无",
    "Portal username": "门户用户名",
    "Portal password": "门户密码",
    "Account status": "账户状态",
    "Active": "启用",
    "Disabled": "禁用",
    "Add Customer": "添加客户",
    "Tariff Rule": "费率规则",
    "Tariff rule": "费率规则",
    "Tariff": "费率",
    "Rule type": "规则类型",
    "Fixed markup": "固定加价",
    "Percentage markup": "百分比加价",
    "Fixed amount": "固定金额",
    "Markup percent": "加价百分比",
    "Markup": "加价",
    "fixed": "固定",
    "no tariff": "暂无费率",
    "Booking": "预订",
    "Booking disabled": "预订已禁用",
    "Allowed carrier modes": "允许的承运商模式",
    "Allowed booking modes": "允许的预订模式",
    "Mothership sandbox": "Mothership 沙箱",
    "SpeedShip LTL": "SpeedShip LTL",
    "Priority1 LTL": "Priority1 LTL",
    "FedEx Freight": "FedEx Freight",
    "Demo rates": "演示费率",
    "Customers can book only the selected carrier modes. Uncheck all to disable booking.": "客户只能预订已选中的承运商模式。取消全选可禁用预订。",
    "Quotes for this customer will pull rates from every selected carrier mode.": "该客户的报价会从所有已选承运商模式拉取费率。",
    "Save Tariff": "保存费率",
    "Save Changes": "保存更改",
    "Customer and Mode": "客户与模式",
    "If the selected customer has an address on file, pickup will prefill from it.": "如果所选客户已有地址记录，提货信息会自动带出。",
    "Rates will use the carrier modes assigned to the selected customer.": "费率将使用分配给所选客户的承运商模式。",
    "Pickup": "提货",
    "Quote details": "报价详情",
    "Reference / PO number": "参考号 / PO 号",
    "Pickup date": "提货日期",
    "Ready time": "提货时间",
    "Company and address": "公司与地址",
    "Street": "街道",
    "City": "城市",
    "State": "州",
    "ZIP": "邮编",
    "Contact and hours": "联系信息与营业时间",
    "Phone": "电话",
    "Email": "邮箱",
    "Accessorials": "附加服务",
    "Select accessorials": "选择附加服务",
    "Appointment": "预约",
    "Liftgate": "尾板",
    "Inside": "入室搬运",
    "Limited access": "限制进入",
    "Residential": "住宅地址",
    "Cross dock": "交叉转运",
    "Container freight station": "集装箱货运站",
    "Hazmat": "危险品",
    "Alcohol": "酒类",
    "Tobacco": "烟草",
    "Tradeshow": "展会",
    "Delivery": "送货",
    "Scheduled delivery": "预约送货",
    "Residential delivery requires scheduled delivery.": "住宅送货需要预约送货。",
    "Freight": "货物",
    "Apply suggestions to all items": "运费等级智能输入",
    "Add Item": "添加条目",
    "Get Rates": "获取报价",
    "Quote Results": "报价结果",
    "Submit a quote to see available rates.": "提交报价后即可查看可用费率。",
    "Shipments": "发运",
    "Invoices": "发票",
    "Mothership invoice sync": "Mothership 发票同步",
    "Pull existing carrier invoices into the admin invoice list.": "将现有承运商发票拉取到管理员发票列表中。",
    "Ready for sync": "准备同步",
    "Sync from Mothership": "从 Mothership 同步",
    "Details": "详情",
    "Item 1": "条目 1",
    "One row equals one freight line.": "一行对应一条货运明细。",
    "Remove": "移除",
    "Quantity": "数量",
    "Cargo type": "货物类型",
    "Select type": "选择类型",
    "Pallet": "托盘",
    "Box": "纸箱",
    "Crate": "木箱",
    "Freight units": "货物单位",
    "lb / in": "磅 / 英寸",
    "kg / cm": "千克 / 厘米",
    "Pieces per unit": "单托箱数/件数",
    "Weight each (lbs)": "单托重量（磅）",
    "Weight each (kg)": "单托重量（千克）",
    "Length": "长度",
    "Width": "宽度",
    "Height": "高度",
    "Length (in)": "长度（英寸）",
    "Width (in)": "宽度（英寸）",
    "Height (in)": "高度（英寸）",
    "Length (cm)": "长度（厘米）",
    "Width (cm)": "宽度（厘米）",
    "Height (cm)": "高度（厘米）",
    "Description": "货物描述",
    "Freight class": "运费等级",
    "Select class": "选择等级",
    "Optional NMFC": "可选 NMFC",
    "Stackable": "可堆叠",
    "Used": "二手",
    "Machinery": "机械设备",
    "Suggested freight class: enter quantity, weight, and dimensions to calculate one.": "建议运费等级：输入数量、重量和尺寸后即可计算。",
    "Suggested freight class: calculating...": "建议运费等级：计算中...",
    "No freight details recorded.": "未记录货运明细。",
    "Class": "等级",
    "lbs each": "磅/件",
    "lbs total": "磅总计",
    "kg each": "千克/件",
    "kg total": "千克总计",
    "in": "英寸",
    "cm": "厘米",
    "Sell price": "售价",
    "Server ready": "服务器已就绪",
    "Sign in to access the local TMS": "登录后即可访问本地 TMS",
    "Email or password is incorrect.": "邮箱或密码不正确。",
    "Select at least one carrier mode for this customer.": "请为该客户至少选择一种承运商模式。",
    "Customer added.": "客户已添加。",
    "Tariff saved.": "费率已保存。",
    "Quote created.": "报价已创建。",
    "Carrier returned no rates for this lane.": "该线路未返回费率。",
    "Syncing...": "同步中...",
    "Sync in progress": "同步进行中",
    "Synced {count} invoices": "已同步 {count} 张发票",
    "Sync failed": "同步失败",
    "Mothership sync complete.": "Mothership 同步完成。",
    "Mothership sync complete: {created} created, {updated} updated.": "Mothership 同步完成：新增 {created} 条，更新 {updated} 条。",
    "created.": "已创建。",
    "updated.": "已更新。",
    "Could not sync Mothership invoices.": "无法同步 Mothership 发票。",
    "Request failed.": "请求失败。",
    "Signed in as {email}.": "已登录为 {email}。",
    "Quote details copied into New Quote.": "报价详情已复制到新报价。",
    "Customer updated.": "客户已更新。",
    "Customer deleted.": "客户已删除。",
    "Customer {status}.": "客户已{status}。",
    "Delete {name}? This removes the customer and related data.": "删除 {name}？这会移除客户及相关数据。",
    "Please fill in the required fields.": "请填写必填字段。",
    "This Mothership quote is not purchasable yet.": "这条 Mothership 报价目前还不能购买。",
    "Mothership needs:": "Mothership 需要：",
    "Delete {name}? This removes the customer and related data.": "删除 {name}？这会移除客户及相关数据。",
    "Please fill in the required fields.": "请填写必填字段。",
    "Select time": "选择时间",
    "Pickup open time must be earlier than pickup close time.": "提货开始时间必须早于结束时间。",
    "Pickup ready time must not be earlier than pickup opening time.": "提货准备时间不能早于提货开始时间。",
    "Pickup ready time must be earlier than pickup close time.": "提货准备时间必须早于提货结束时间。",
    "Enter valid pickup times.": "请输入有效的提货时间。",
    "Use pickup opening time": "使用提货开始时间",
    "Pickup ready time was adjusted to the pickup opening time.": "提货准备时间已调整为提货开始时间。",
    "Carrier status": "承运商状态",
    "{provider}: {count} rate(s) returned.": "{provider}：返回 {count} 条报价。",
    "No {provider} rates: {message}": "无 {provider} 报价：{message}",
    "No Mothership rates: pickup ready time is earlier than pickup opening time.": "无 Mothership 报价：提货准备时间早于提货开始时间。",
    "Select a customer to see the carrier modes assigned by admin.": "选择客户后可查看管理员分配的承运商模式。",
    "Rates will use the carrier modes assigned to the selected customer.": "费率会使用所选客户已分配的承运商模式。",
    "Your quote uses the carrier modes assigned to your account: {label}.": "你的报价将使用分配到你账户的承运商模式：{label}。",
    "Assigned carrier modes for {name}: {label}.": "{name} 的已分配承运商模式：{label}。",
    "Your quote uses the carrier modes assigned to your account: {label}.": "你的报价将使用分配到你账户的承运商模式：{label}。",
    "Assigned carrier modes for {name}: {label}.": "{name} 的已分配承运商模式：{label}。",
    "No billing email": "无账单邮箱",
    "No portal user": "无门户用户",
    "Your account": "你的账户",
    "Select a customer": "选择客户",
    "Book after quote": "报价后预订",
    "Quote only": "仅报价",
    "Carrier mode": "承运商模式",
    "None": "无",
    "Applying freight class suggestions to all items.": "正在进行运费等级智能输入。",
    "Applied freight class suggestions to {count} item{suffix}.": "已将运费等级智能输入应用到 {count} 个条目{suffix}。",
    "Add quantity, weight, and dimensions to calculate freight class suggestions.": "请填写数量、重量和尺寸以计算运费等级智能输入。",
    "Suggested freight class: calculating...": "建议运费等级：计算中...",
    "Suggested freight class: {value}": "建议运费等级：{value}",
    "View Quote": "查看报价",
    "View Shipment": "查看发运",
    "Track": "跟踪",
    "BOL": "提单",
    "POD": "送货回单",
    "View BOL": "查看提单",
    "View POD": "查看回单",
    "View Payload": "查看载荷",
    "View Invoice": "查看发票",
    "Track Shipment": "跟踪发运",
    "Open document": "打开文档",
    "Self-owned Truck": "自有卡车",
    "Mothership": "Mothership",
    "Local": "本地",
    "invoice reference": "发票参考",
    "import": "导入",
    "TMS Reference / PO": "TMS 参考号 / PO",
    "Quote Summary": "报价摘要",
    "Quote Audit": "报价审计",
    "Rates": "费率",
    "Re-enter Quote": "重新录入报价",
    "Reference only": "仅参考记录",
    "Waiting for detail fields": "等待明细字段",
    "Pending": "待处理",
    "Carrier request completed": "承运商请求完成",
    "Carriers": "承运商",
    "connection succeeded": "连接成功",
    "Rate results are loading": "报价结果正在加载",
    "Please wait while we contact the carrier platforms.": "请稍候，我们正在联系承运商平台。",
    "Load more results": "加载更多结果",
    "Showing {visible} of {total} results": "显示 {visible} / {total} 条结果",
    "Book Shipment": "预订发运",
    "Booking disabled for this carrier.": "该承运商已禁用预订。",
    "No shipments yet.": "暂无发运记录。",
    "No shipments booked yet.": "暂无已预订的发运。",
    "Imported from Mothership": "从 Mothership 导入",
    "Other invoices": "其他发票",
    "Invoices hydrated from the carrier invoice sync.": "由承运商发票同步填充的发票。",
    "Invoices created locally from booked shipments.": "根据已预订发运在本地创建的发票。",
    "No Mothership invoices imported yet.": "尚未导入 Mothership 发票。",
    "No local invoices yet.": "暂无本地发票。",
    "invoice hidden in the other tab.": "条发票隐藏在另一个标签页中。",
    "No customers yet.": "暂无客户。",
    "No quotes yet.": "暂无报价。",
    "No invoices yet.": "暂无发票。",
    "No shipments booked yet.": "暂无已预订的发运。",
    "No rate details.": "暂无费率详情。",
    "Sell price": "售价",
    "Purchasable": "可购买",
    "Not purchasable": "不可购买",
    "Outbound request": "外发请求",
    "Carrier response": "承运商响应",
    "No carrier audit data recorded for this quote.": "该报价没有承运商审计数据。",
    "No tracking events yet.": "暂无跟踪事件。",
    "Quote Details": "报价详情",
    "Tracking {confirmationNumber}": "跟踪 {confirmationNumber}",
    "Loading tracking details...": "正在加载跟踪详情...",
    "Tracking lookup failed.": "跟踪查询失败。",
    "Proof of Delivery": "送货回单",
    "Bill of Lading": "提单",
    "Carrier Documents": "承运商文档",
    "Documents": "文档",
    "Document": "文档",
    "Loading proof of delivery...": "正在加载送货回单...",
    "Loading bill of lading...": "正在加载提单...",
    "POD lookup failed.": "回单查询失败。",
    "BOL lookup failed.": "提单查询失败。",
    "POD is not here yet.": "回单尚未返回。",
    "No bill of lading was returned for this shipment yet.": "该发运尚未返回提单。",
    "POD is in your actual Mothership account, please log in to download.": "回单在你的真实 Mothership 账户中，请登录后下载。",
    "Proof of Delivery {id}": "送货回单 {id}",
    "Bill of Lading {id}": "提单 {id}",
    "Confirm Shipment Booking": "确认发运预订",
    "Confirm shipment booking": "确认发运预订",
    "This will finalize the shipment with the carrier platform.": "这将把发运提交到承运商平台。",
    "This will create a shipment booking in the TMS.": "这将在 TMS 中创建发运预订。",
    "Please confirm before continuing.": "请确认后继续。",
    "Booking blocked by Mothership": "Mothership 阻止预订",
    "Purchase eligibility": "可购买状态",
    "Fix these fields": "请修正以下字段",
    "Pickup suggestions": "提货建议",
    "Delivery suggestions": "送货建议",
    "No outbound request recorded for this quote.": "该报价未记录外发请求。",
    "No carrier response recorded for this quote.": "该报价未记录承运商响应。",
    "Cancel": "取消",
    "Confirm Booking": "确认预订",
    "Shipment Summary": "发运摘要",
    "Last update": "最近更新",
    "No tracking updates yet": "暂无跟踪更新",
    "View Shipment": "查看发运",
    "Shipment booking is disabled for this carrier.": "该承运商的发运预订已禁用。",
    "Booking disabled for this carrier.": "该承运商已禁用预订。",
    "Could not book shipment.": "无法预订发运。",
    "Booked {confirmationNumber}.": "已预订 {confirmationNumber}。",
    "Confirm shipment booking": "确认发运预订",
    "Carrier": "承运商",
    "Service": "服务",
    "Reference / PO": "参考号 / PO",
    "Lane": "线路",
    "Cost": "成本",
    "Mothership status": "Mothership 状态",
    "No SCAC": "无 SCAC",
    "Offer": "报价",
    "Transit": "运输时长",
    "PO": "PO",
    "This invoice is not linked to a Mothership entity ID.": "该发票未关联到 Mothership 实体 ID。",
    "View Payload": "查看载荷",
    "View Invoice": "查看发票",
    "Amount": "金额",
    "Issued": "开具时间",
    "Due": "到期时间",
    "Shipment": "发运",
    "Mothership invoice id": "Mothership 发票 ID",
    "Pending detail import": "等待明细导入",
    "POD is only available when Mothership returns a carrier entity ID for this invoice.": "仅当 Mothership 为此发票返回承运商实体 ID 时，POD 才可用。",
    "Mothership returned this record through the modified invoices feed, but the current sync does not yet have resolved amount, PO, or invoice detail fields for this item.": "Mothership 通过更新后的发票数据流返回了这条记录，但当前同步尚未解析出金额、PO 或发票明细字段。",
    "Invoice Reference": "发票参考",
    "Invoice Summary": "发票摘要",
    "Reference / PO number": "参考号 / PO 号",
    "Not available": "不可用",
    "Not set": "未设置",
    "No invoice line items were returned.": "未返回发票明细。",
    "Mothership Payload": "Mothership 载荷",
    "Invoice Line Items": "发票明细项目",
    "No raw Mothership payload was recorded for this invoice.": "该发票未记录原始 Mothership 载荷。",
    "This raw payload is shown to admins so we can map the real Mothership invoice fields from your account.": "管理员可查看该原始载荷，以便将你账户里的 Mothership 发票字段映射出来。",
    "Line Item {n}": "明细 {n}",
    "Invoice line item": "发票明细",
    "No data recorded.": "未记录数据。",
    "Invoice groups": "发票分组",
    "My Portal": "我的门户",
    "Recent Quotes": "最近报价",
    "Recent Invoices": "最近发票",
    "Load more results": "加载更多结果"
  }
};

function getPreferredLanguage() {
  const saved = window.localStorage.getItem(languageKey);
  if (saved === "zh" || saved === "en") {
    return saved;
  }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function setLanguage(language) {
  const normalized = language === "zh" ? "zh" : "en";
  state.language = normalized;
  window.localStorage.setItem(languageKey, normalized);
  document.documentElement.lang = normalized === "zh" ? "zh-CN" : "en";
  applyTranslations();
  syncLanguageSwitches();
  updateFreightUnitLabels();
  renderHealth();
  renderDashboardSupportPanel();
  renderModal();
  if (state.currentQuote) {
    renderQuoteResults(state.currentQuote);
  } else {
    const quoteResults = document.getElementById("quoteResults");
    if (quoteResults) {
      quoteResults.textContent = t("Submit a quote to see available rates.");
    }
  }
  renderShipments();
  renderInvoices();
  renderDashboard();
  renderCustomers();
  populateTimeSelects();
  document.querySelectorAll(".accessorial-dropdown").forEach((details) => syncAccessorialDropdown(details));
  updateFreightClassSuggestion();
}

function t(text, params = {}) {
  const dictionary = translations[state.language] || {};
  let translated = state.language === "zh" ? dictionary[text] || text : text;
  return translated.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ""));
}

function applyTranslations() {
  translateSubtree(document);
  document.title = t("Trucking TMS");
}

function translateSubtree(root) {
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    const requiredMark = node.querySelector(".required-mark");
    node.textContent = t(node.dataset.i18n);
    if (requiredMark) {
      node.appendChild(requiredMark);
    }
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  });
  root.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.setAttribute("title", t(node.dataset.i18nTitle));
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
}

function syncLanguageSwitches() {
  document.querySelectorAll("[data-language-select]").forEach((select) => {
    select.value = state.language;
  });
}

function getPreferredFreightUnits() {
  const saved = window.localStorage.getItem(freightUnitsKey);
  return saved === "metric" ? "metric" : "imperial";
}

function normalizeFreightUnits(value) {
  return value === "metric" ? "metric" : "imperial";
}

function syncFreightUnitSwitches() {
  document.querySelectorAll("[data-freight-unit-select]").forEach((select) => {
    select.value = state.freightUnits;
  });
}

function setLabelTextWithRequiredMark(node, text) {
  if (!node) {
    return;
  }

  const requiredMark = node.querySelector(".required-mark");
  node.textContent = text;
  if (requiredMark) {
    node.appendChild(requiredMark);
  }
}

function getFreightUnitConfig(units = state.freightUnits) {
  if (normalizeFreightUnits(units) === "metric") {
    return {
      system: "metric",
      weightLabel: t("Weight each (kg)"),
      lengthLabel: t("Length (cm)"),
      widthLabel: t("Width (cm)"),
      heightLabel: t("Height (cm)"),
      weightSummaryUnit: t("kg each"),
      totalWeightSummaryUnit: t("kg total"),
      dimensionSummaryUnit: t("cm")
    };
  }

  return {
    system: "imperial",
    weightLabel: t("Weight each (lbs)"),
    lengthLabel: t("Length (in)"),
    widthLabel: t("Width (in)"),
    heightLabel: t("Height (in)"),
    weightSummaryUnit: t("lbs each"),
    totalWeightSummaryUnit: t("lbs total"),
    dimensionSummaryUnit: t("in")
  };
}

function updateFreightUnitLabels(root = document) {
  const config = getFreightUnitConfig();
  root.querySelectorAll("[data-freight-unit-label='weight']").forEach((node) => setLabelTextWithRequiredMark(node, config.weightLabel));
  root.querySelectorAll("[data-freight-unit-label='length']").forEach((node) => setLabelTextWithRequiredMark(node, config.lengthLabel));
  root.querySelectorAll("[data-freight-unit-label='width']").forEach((node) => setLabelTextWithRequiredMark(node, config.widthLabel));
  root.querySelectorAll("[data-freight-unit-label='height']").forEach((node) => setLabelTextWithRequiredMark(node, config.heightLabel));
}

function convertFreightMeasurement(value, measurement, fromUnits, toUnits) {
  if (value === "" || value == null) {
    return value;
  }

  const text = String(value).trim();
  if (!text) {
    return value;
  }

  const numeric = Number(text);
  if (!Number.isFinite(numeric)) {
    return value;
  }

  const source = normalizeFreightUnits(fromUnits);
  const target = normalizeFreightUnits(toUnits);
  if (source === target) {
    return numeric;
  }

  if (measurement === "weight") {
    if (source === "metric" && target === "imperial") {
      return numeric * 2.2046226218487757;
    }
    if (source === "imperial" && target === "metric") {
      return numeric / 2.2046226218487757;
    }
  }

  if (source === "metric" && target === "imperial") {
    return numeric / 2.54;
  }
  if (source === "imperial" && target === "metric") {
    return numeric * 2.54;
  }

  return numeric;
}

function formatFreightInputValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }

  return String(Number(numeric.toFixed(2)));
}

function convertFreightRowValues(values, fromUnits, toUnits) {
  const converted = { ...values };
  ["weight", "length", "width", "height"].forEach((field) => {
    if (converted[field] === "" || converted[field] == null) {
      return;
    }
    converted[field] = convertFreightMeasurement(converted[field], field === "weight" ? "weight" : "dimension", fromUnits, toUnits);
  });
  return converted;
}

function convertFreightRowsForDisplay(rows, fromUnits, toUnits) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => convertFreightRowValues(row, fromUnits, toUnits));
}

function convertFreightRowInputs(row, fromUnits, toUnits) {
  ["weight", "length", "width", "height"].forEach((field) => {
    const control = freightRowField(row, field);
    if (!control) {
      return;
    }

    const converted = convertFreightMeasurement(control.value, field === "weight" ? "weight" : "dimension", fromUnits, toUnits);
    control.value = formatFreightInputValue(converted);
  });
}

function setFreightUnits(units) {
  const nextUnits = normalizeFreightUnits(units);
  if (state.freightUnits === nextUnits) {
    syncFreightUnitSwitches();
    updateFreightUnitLabels();
    return;
  }

  const previousUnits = state.freightUnits;
  state.freightUnits = nextUnits;
  window.localStorage.setItem(freightUnitsKey, nextUnits);

  freightRows().forEach((row) => convertFreightRowInputs(row, previousUnits, nextUnits));
  syncFreightUnitSwitches();
  updateFreightUnitLabels();
  updateFreightClassSuggestion();
}

const state = {
  language: getPreferredLanguage(),
  freightUnits: getPreferredFreightUnits(),
  health: null,
  user: null,
  customers: [],
  tariffs: [],
  quotes: [],
  shipments: [],
  invoices: [],
  currentQuote: null,
  quoteLoading: false,
  quoteResultsLimit: 12,
  freightSuggestionTimer: null,
  freightSuggestionRequestToken: 0,
  carrierModeTouched: false,
  pendingQuoteReentry: null,
  pendingBooking: null,
  invoiceTab: "mothership",
  modal: null
};

const zipLookupTimers = new WeakMap();
const zipLookupTokens = new WeakMap();
const freightSuggestionTimers = new WeakMap();
const freightSuggestionTokens = new WeakMap();

const viewMeta = {
  dashboard: () =>
    [t("Dashboard"), isStaffUser() ? t("Watch quote activity, shipment status, and invoice drafts.") : t("Track your quotes, shipments, and invoices.")],
  customers: [t("Customers"), t("Manage customer accounts and tariff rules.")],
  quote: [t("New Quote"), ""],
  shipments: [t("Shipments"), t("Review local bookings and carrier shipment references.")],
  invoices: [t("Invoices"), t("See draft invoices created from booked shipments.")]
};

document.addEventListener("DOMContentLoaded", async () => {
  applyTranslations();
  syncLanguageSwitches();
  syncFreightUnitSwitches();
  updateFreightUnitLabels();
  wireLanguageSwitches();
  wireFreightUnitSwitches();
  wireNavigation();
  wireForms();
  wireAuth();
  wireModal();
  await bootApp();
});

function wireLanguageSwitches() {
  document.querySelectorAll("[data-language-select]").forEach((select) => {
    if (select.dataset.languageBound === "true") {
      return;
    }
    select.addEventListener("change", (event) => {
      setLanguage(event.target.value);
    });
    select.dataset.languageBound = "true";
  });
}

function wireFreightUnitSwitches() {
  document.querySelectorAll("[data-freight-unit-select]").forEach((select) => {
    if (select.dataset.freightUnitBound === "true") {
      return;
    }
    select.addEventListener("change", (event) => {
      setFreightUnits(event.target.value);
    });
    select.dataset.freightUnitBound = "true";
  });
}

function wireNavigation() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.querySelectorAll("[data-modal]").forEach((button) => {
    button.addEventListener("click", () => openDashboardModal(button.dataset.modal));
  });

  document.getElementById("refreshButton").addEventListener("click", refreshAll);
  document.getElementById("logoutButton").addEventListener("click", logout);

  const mothershipInvoiceSyncButton = document.getElementById("mothershipInvoiceSyncButton");
  if (mothershipInvoiceSyncButton) {
    mothershipInvoiceSyncButton.addEventListener("click", async () => {
      const status = document.getElementById("mothershipInvoiceSyncStatus");
      mothershipInvoiceSyncButton.disabled = true;
      mothershipInvoiceSyncButton.textContent = t("Syncing...");
      if (status) {
        status.textContent = t("Sync in progress");
      }

      try {
        const response = await api("/api/invoices/sync", {
          method: "POST"
        });
        if (status) {
          status.textContent = t("Synced {count} invoices", { count: response.synced.created + response.synced.updated });
        }
        showToast(t("Mothership sync complete: {created} created, {updated} updated.", {
          created: response.synced.created,
          updated: response.synced.updated
        }));
        await refreshAll();
      } catch (error) {
        if (status) {
          status.textContent = t("Sync failed");
        }
        showToast(error.message || t("Could not sync Mothership invoices."), true);
      } finally {
        mothershipInvoiceSyncButton.disabled = false;
        mothershipInvoiceSyncButton.textContent = t("Sync from Mothership");
      }
    });
  }

  document.addEventListener("click", (event) => {
    const trackButton = event.target.closest("[data-track-shipment]");
    if (trackButton) {
      openShipmentTracking(trackButton.dataset.trackShipment);
      return;
    }

    const quoteButton = event.target.closest("[data-view-quote]");
    if (quoteButton) {
      openQuoteDetails(quoteButton.dataset.viewQuote);
      return;
    }

    const loadMoreButton = event.target.closest("[data-load-more-rates]");
    if (loadMoreButton) {
      loadMoreQuoteRates();
      return;
    }

    const invoiceTabButton = event.target.closest("[data-invoice-tab]");
    if (invoiceTabButton) {
      setInvoiceTab(invoiceTabButton.dataset.invoiceTab);
      return;
    }

    const reenterButton = event.target.closest("[data-reenter-quote]");
    if (reenterButton) {
      reenterQuote(reenterButton.dataset.reenterQuote);
      return;
    }

    const invoiceButton = event.target.closest("[data-view-invoice]");
    if (invoiceButton) {
      openInvoiceDetails(invoiceButton.dataset.viewInvoice);
      return;
    }

    const invoicePodButton = event.target.closest("[data-view-pod-shipment]");
    if (invoicePodButton) {
      openShipmentDocuments(invoicePodButton.dataset.viewPodShipment, "pod");
      return;
    }

    const invoiceCarrierBolButton = event.target.closest("[data-view-bol-carrier-entity]");
    if (invoiceCarrierBolButton) {
      openCarrierShipmentDocuments(invoiceCarrierBolButton.dataset.viewBolCarrierEntity, "bol");
      return;
    }

    const invoiceCarrierPodButton = event.target.closest("[data-view-pod-carrier-entity]");
    if (invoiceCarrierPodButton) {
      openCarrierShipmentDocuments(invoiceCarrierPodButton.dataset.viewPodCarrierEntity, "pod");
      return;
    }

    const applyAllFreightSuggestionsButton = event.target.closest("[data-apply-all-freight-suggestions]");
    if (applyAllFreightSuggestionsButton) {
      applyAllFreightClassSuggestions();
      return;
    }

    const addFreightRowButton = event.target.closest("[data-add-freight-row]");
    if (addFreightRowButton) {
      addFreightRow();
      return;
    }

    const removeFreightRowButton = event.target.closest("[data-remove-freight-row]");
    if (removeFreightRowButton) {
      removeFreightRow(removeFreightRowButton.closest("[data-freight-row]"));
      return;
    }

    const confirmBookingButton = event.target.closest("[data-confirm-booking]");
    if (confirmBookingButton) {
      confirmPendingBooking();
      return;
    }

    const cancelBookingButton = event.target.closest("[data-cancel-booking]");
    if (cancelBookingButton) {
      cancelPendingBooking();
      return;
    }

    const shipmentButton = event.target.closest("[data-view-shipment]");
    if (shipmentButton) {
      openShipmentDetails(shipmentButton.dataset.viewShipment);
      return;
    }

    const bolButton = event.target.closest("[data-view-bol]");
    if (bolButton) {
      openShipmentDocuments(bolButton.dataset.viewBol, "bol");
      return;
    }

    const podButton = event.target.closest("[data-view-pod]");
    if (podButton) {
      openShipmentDocuments(podButton.dataset.viewPod, "pod");
      return;
    }
  });
}

function wireAuth() {
  const loginError = document.getElementById("loginError");
  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (loginError) {
      loginError.textContent = "";
    }
    const form = new FormData(event.currentTarget);
    try {
      const response = await api("/api/login", {
        method: "POST",
        body: {
          email: form.get("email"),
          password: form.get("password")
        }
      });
      state.user = response.user;
      showApp();
      applyPermissions();
      showToast(t("Signed in as {email}.", { email: state.user.email }));
      await refreshAll();
    } catch (error) {
      if (loginError) {
        loginError.textContent = error.message || t("Email or password is incorrect.");
      }
    }
  });
}

function wireForms() {
  decorateRequiredQuoteLabels();
  populateTimeSelects();
  wireAccessorialDropdowns();
  ensureFreightRows();

  document.getElementById("customerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/customers", {
      method: "POST",
      body: {
        companyName: form.get("companyName"),
        billingEmail: form.get("billingEmail"),
        paymentTerms: form.get("paymentTerms"),
        companyPhone: form.get("companyPhone"),
        companyOpenTime: form.get("companyOpenTime"),
        companyCloseTime: form.get("companyCloseTime"),
        companyStreet: form.get("companyStreet"),
        companyCity: form.get("companyCity"),
        companyState: form.get("companyState"),
        companyZip: form.get("companyZip"),
        portalEmail: form.get("portalEmail"),
        portalPassword: form.get("portalPassword")
      }
    });
    event.currentTarget.reset();
    showToast(t("Customer added."));
    await refreshAll();
  });

  document.getElementById("tariffForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const allowedCarrierModes = form.getAll("allowedCarrierModes");
    const allowedBookingCarrierModes = form
      .getAll("allowedBookingCarrierModes")
      .filter((mode) => allowedCarrierModes.includes(mode));
    const tariffError = document.getElementById("tariffFormError");
    if (tariffError) {
      tariffError.textContent = "";
    }
    if (allowedCarrierModes.length === 0) {
      const message = t("Select at least one carrier mode for this customer.");
      if (tariffError) {
        tariffError.textContent = message;
      }
      showToast(message, true);
      return;
    }
    await api("/api/tariffs", {
      method: "POST",
      body: {
        customerId: form.get("customerId"),
        ruleType: form.get("ruleType"),
        fixedAmount: form.get("fixedAmount"),
        markupPercentage: form.get("markupPercentage"),
        allowedCarrierModes,
        allowedBooking: allowedBookingCarrierModes.length > 0,
        allowedBookingCarrierModes
      }
    });
    showToast(t("Tariff saved."));
    await refreshAll();
  });

  const quoteForm = document.getElementById("quoteForm");
  quoteForm.addEventListener("input", () => {
    clearQuoteFormErrors(quoteForm);
    updateFreightClassSuggestion();
  });
  quoteForm.addEventListener("change", () => {
    clearQuoteFormErrors(quoteForm);
    updateFreightClassSuggestion();
  });
  quoteForm.addEventListener("click", (event) => {
    const button = event.target.closest("[data-use-pickup-opening-time]");
    if (!button) {
      return;
    }

    const pickupOpen = quoteForm.elements.pickupOpen;
    const pickupTime = quoteForm.elements.pickupTime;
    if (!pickupOpen || !pickupTime || !pickupOpen.value) {
      return;
    }

    pickupTime.value = pickupOpen.value;
    clearQuoteFormErrors(quoteForm);
    showToast(t("Pickup ready time was adjusted to the pickup opening time."));
  });
  quoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateQuoteForm(quoteForm)) {
      return;
    }

    const formError = document.getElementById("quoteFormError");
    try {
      state.quoteLoading = true;
      state.quoteResultsLimit = 12;
      renderQuoteResultsLoading();
      const body = quotePayload(new FormData(event.currentTarget));
      const response = await api("/api/quotes", {
        method: "POST",
        body
      });
      state.currentQuote = { ...response.quote, displayFreightUnits: state.freightUnits };
      showToast(t("Quote created."));
      renderQuoteResults(response.quote);
      await refreshAll({ keepQuoteResults: true });
    } catch (error) {
      state.quoteLoading = false;
      const noRates = error?.code === "NO_RATES_FOUND";
      const message = noRates
        ? t("Carrier returned no rates for this lane.")
        : error.message || t("Request failed.");
      state.currentQuote = null;
      if (formError) {
        formError.textContent = message;
      }
      if (noRates) {
        const results = document.getElementById("quoteResults");
        results.classList.add("empty-state");
        results.textContent = message;
      }
      showToast(message, true);
    } finally {
      state.quoteLoading = false;
    }
  });

  const tariffCustomerSelect = document.getElementById("tariffCustomerSelect");
  if (tariffCustomerSelect && !tariffCustomerSelect.dataset.modeSyncBound) {
    tariffCustomerSelect.addEventListener("change", () => {
      syncTariffCarrierModes(tariffCustomerSelect.value);
      syncTariffBookingPermission(tariffCustomerSelect.value);
    });
    tariffCustomerSelect.dataset.modeSyncBound = "true";
  }
  document.querySelectorAll("#tariffForm input[name='allowedCarrierModes']").forEach((checkbox) => {
    checkbox.addEventListener("change", () => syncTariffBookingPermission(tariffCustomerSelect?.value || ""));
  });

  syncCarrierControls();
  updateFreightClassSuggestion();
  wireZipAutofill();
}

async function bootApp() {
  state.health = await api("/api/health", { public: true });
  renderHealth();

  try {
    const response = await api("/api/me", { public: true });
    state.user = response.user;
    showApp();
    applyPermissions();
    await refreshAll();
  } catch (error) {
    if (error.status !== 401) {
      showToast(error.message, true);
    }
    state.user = null;
    showLogin();
    applyPermissions();
  }
}

async function refreshAll(options = {}) {
  try {
    const [health, customers, tariffs, quotes, shipments, invoices] = await Promise.all([
      api("/api/health"),
      api("/api/customers"),
      api("/api/tariffs"),
      api("/api/quotes"),
      api("/api/shipments"),
      api("/api/invoices")
    ]);

    state.health = health;
    state.customers = customers.customers;
    state.tariffs = tariffs.tariffRules;
    state.quotes = quotes.quotes;
    state.shipments = shipments.shipments;
    state.invoices = invoices.invoices;

    renderHealth();
    renderUserChip();
    renderCustomerOptions();
    renderCustomers();
    renderDashboard();
    renderShipments();
    renderInvoices();
    renderModal();
    syncCarrierControls();
    if (isCustomerUser() && isPickupAutofillEmpty()) {
      autofillPickupFromCustomer(state.user?.customerId, false);
      syncCarrierControls();
    }

    if (!options.keepQuoteResults && !state.currentQuote) {
      document.getElementById("quoteResults").textContent = "Submit a quote to see available rates.";
    }
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      showLogin();
      applyPermissions();
      return;
    }
    showToast(error.message, true);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin"
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = new Error(payload.message || "Request failed.");
    error.status = response.status;
    error.code = payload.error;
    throw error;
  }

  return payload;
}

function setView(name) {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === name);
  });

  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `${name}View`);
  });

  const meta = viewMeta[name] || viewMeta.dashboard;
  const [title, subtitle] = typeof meta === "function" ? meta() : meta;
  document.getElementById("viewTitle").textContent = title;
  document.getElementById("viewSubtitle").textContent = subtitle;

  if (name === "quote" && isCustomerUser() && !state.pendingQuoteReentry) {
    window.requestAnimationFrame(() => {
      autofillPickupFromCustomer(state.user?.customerId, true);
      syncCarrierControls();
    });
  }
}

function showLogin() {
  closeModal();
  document.getElementById("loginView").classList.remove("hidden");
  document.getElementById("appShell").classList.add("hidden");
  const loginError = document.getElementById("loginError");
  if (loginError) {
    loginError.textContent = "";
  }
}

function showApp() {
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
}

function applyPermissions() {
  const isStaff = isStaffUser();
  const isCustomer = isCustomerUser();
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", !isStaff);
  });
  document.getElementById("customersNavButton").classList.toggle("hidden", !isStaff);
  const customersMetricButton = document.getElementById("customersMetricButton");
  if (customersMetricButton) {
    customersMetricButton.classList.toggle("hidden", !isStaff);
  }
  const customerMetricLabel = document.getElementById("customerMetricLabel");
  const quoteMetricLabel = document.getElementById("quoteMetricLabel");
  const shipmentMetricLabel = document.getElementById("shipmentMetricLabel");
  const invoiceMetricLabel = document.getElementById("invoiceMetricLabel");
  if (customerMetricLabel) {
    customerMetricLabel.textContent = isStaff ? "Customers" : "Your Account";
  }
  if (quoteMetricLabel) {
    quoteMetricLabel.textContent = isStaff ? "Quotes" : "My Quotes";
  }
  if (shipmentMetricLabel) {
    shipmentMetricLabel.textContent = isStaff ? "Shipments" : "My Shipments";
  }
  if (invoiceMetricLabel) {
    invoiceMetricLabel.textContent = isStaff ? "Draft invoices" : "My Invoices";
  }
  const quoteMetaPanel = document.getElementById("quoteMetaPanel");
  if (quoteMetaPanel) {
    quoteMetaPanel.classList.toggle("hidden", isCustomer);
  }
  const quoteCustomerSelect = document.getElementById("quoteCustomerSelect");
  if (quoteCustomerSelect && isCustomer) {
    quoteCustomerSelect.value = state.user?.customerId || quoteCustomerSelect.value;
    if (!state.pendingQuoteReentry) {
      autofillPickupFromCustomer(quoteCustomerSelect.value, true);
    }
  }
  if (quoteCustomerSelect && !quoteCustomerSelect.dataset.autofillBound) {
    quoteCustomerSelect.addEventListener("change", () => {
      autofillPickupFromCustomer(quoteCustomerSelect.value, true);
      syncCarrierControls();
    });
    quoteCustomerSelect.dataset.autofillBound = "true";
  }
  if (!isStaff && document.querySelector(".nav-button.active")?.dataset.view === "customers") {
    setView("dashboard");
  }
  renderUserChip();
  renderDashboardSupportPanel();
}

function isStaffUser() {
  return ["admin", "operations"].includes(state.user?.role);
}

function isCustomerUser() {
  return state.user?.role === "customer";
}

function customerPriceLabel() {
  return isCustomerUser() ? t("Cost") : t("Sell price");
}

function hasDisplayValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function customerBookingAllowed(customerId = state.user?.customerId, carrierMode = "") {
  if (!isCustomerUser()) {
    return true;
  }
  const customer = state.customers.find((item) => item.id === customerId) || null;
  if (!customer || customer.allowedBooking === false) {
    return false;
  }
  if (!carrierMode) {
    return customerAllowedBookingModes(customer).length > 0;
  }
  return customerAllowedBookingModes(customer).includes(normalizeCarrierModeValue(carrierMode));
}

function customerAllowedBookingModes(customer) {
  if (!customer || customer.allowedBooking === false) {
    return [];
  }
  const allowedModes = normalizeAllowedCarrierModes(customer.allowedCarrierModes || [], []);
  const fallbackModes = allowedModes.length > 0 ? allowedModes : ["mothershipSandbox"];
  const bookingModes = normalizeAllowedCarrierModes(customer.allowedBookingCarrierModes || [], []);
  const selectedModes = bookingModes.length > 0 ? bookingModes : fallbackModes;
  return selectedModes.filter((mode) => fallbackModes.includes(mode));
}

function renderHealth() {
  const dot = document.getElementById("statusDot");
  const healthText = document.getElementById("healthText");
  const loginDot = document.getElementById("loginStatusDot");
  const loginHealthText = document.getElementById("loginHealthText");

  if (dot) {
    dot.classList.toggle("ready", Boolean(state.health?.ok));
  }
  if (loginDot) {
    loginDot.classList.toggle("ready", Boolean(state.health?.ok));
  }

  const message = state.health?.ok ? t("Server ready") : t("Checking server");
  if (healthText) {
    healthText.textContent = state.user
      ? message
      : t("Sign in to access the local TMS");
  }
  if (loginHealthText) {
    loginHealthText.textContent = message;
  }
}

function renderUserChip() {
  const chip = document.getElementById("userChip");
  if (!chip) {
    return;
  }

  if (!state.user) {
    chip.textContent = "";
    return;
  }

  chip.textContent = `${state.user.email} · ${state.user.role}`;
}

async function logout() {
  await api("/api/logout", {
    method: "POST"
  });
  state.user = null;
  state.currentQuote = null;
  closeModal();
  showLogin();
  renderUserChip();
  renderHealth();
}

function wireModal() {
  document.getElementById("modalCloseButton").addEventListener("click", closeModal);
  document.getElementById("modalOverlay").addEventListener("click", (event) => {
    if (event.target.id === "modalOverlay") {
      closeModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });
}

function openModal(title, bodyHtml) {
  state.modal = { type: "static", title, bodyHtml };
  paintModal(title, bodyHtml);
}

function paintModal(title, bodyHtml) {
  const overlay = document.getElementById("modalOverlay");
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = bodyHtml;
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
}

function closeModal() {
  const overlay = document.getElementById("modalOverlay");
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  document.getElementById("modalBody").innerHTML = "";
  state.modal = null;
  state.pendingBooking = null;
}

function renderModal() {
  if (!state.modal) {
    return;
  }

  if (state.modal.type === "summary") {
    const kind = state.modal.kind;
    const modals = {
      customers: { title: "Customers", body: customerSummaryHtml() },
      quotes: { title: "Quotes", body: quoteSummaryHtml() },
      shipments: { title: "Shipments", body: shipmentSummaryHtml() },
      invoices: { title: "Draft invoices", body: invoiceSummaryHtml() }
    };
    const modal = modals[kind];
    if (modal) {
      paintModal(modal.title, modal.body);
    }
    return;
  }

  paintModal(state.modal.title, state.modal.bodyHtml);
}

function openDashboardModal(kind) {
  if (!["customers", "quotes", "shipments", "invoices"].includes(kind)) {
    return;
  }
  state.modal = { type: "summary", kind };
  renderModal();
}

async function openShipmentTracking(shipmentId) {
  const shipment = state.shipments.find((item) => item.id === shipmentId);
  if (!shipment) {
    return;
  }

  const title = t("Tracking {confirmationNumber}", { confirmationNumber: shipment.confirmationNumber });
  openModal(title, `<div class="empty-state">${escapeHtml(t("Loading tracking details..."))}</div>`);
  try {
    const response = await api(`/api/shipments/${shipmentId}/tracking`);
    if (!state.modal || state.modal.title !== title) {
      return;
    }
    paintModal(title, `
      ${shipmentDetailsHtml(shipment, response.events || [])}
    `);
  } catch (error) {
    if (!state.modal || state.modal.title !== title) {
      return;
    }
    paintModal(title, `<div class="empty-state">${escapeHtml(error.message || t("Tracking lookup failed."))}</div>`);
  }
}

async function openShipmentDetails(shipmentId) {
  const shipment = state.shipments.find((item) => item.id === shipmentId);
  if (!shipment) {
    return;
  }

  await openShipmentTracking(shipmentId);
}

async function openShipmentDocuments(shipmentId, kind = "bol") {
  const shipment = state.shipments.find((item) => item.id === shipmentId);
  if (!shipment) {
    await openCarrierShipmentDocuments(shipmentId, kind);
    return;
  }

  const normalizedKind = String(kind || "bol").toLowerCase() === "pod" ? "pod" : "bol";
  const title = normalizedKind === "pod"
    ? t("Proof of Delivery {confirmationNumber}", { confirmationNumber: shipment.confirmationNumber })
    : t("Bill of Lading {confirmationNumber}", { confirmationNumber: shipment.confirmationNumber });
  openModal(title, `<div class="empty-state">${escapeHtml(normalizedKind === "pod" ? t("Loading proof of delivery...") : t("Loading bill of lading..."))}</div>`);
  try {
    const response = await api(`/api/shipments/${shipmentId}/documents`);
    if (!state.modal || state.modal.title !== title) {
      return;
    }
    const documents = filterShipmentDocumentsByKind(response.documents || [], normalizedKind);
    const notice = response.message || (documents.length === 0
      ? (normalizedKind === "pod" ? t("POD is not here yet.") : t("No bill of lading was returned for this shipment yet."))
      : "");
    paintModal(title, shipmentDocumentsHtml(shipment, documents, notice, normalizedKind));
  } catch (error) {
    if (!state.modal || state.modal.title !== title) {
      return;
    }
    paintModal(title, `<div class="empty-state">${escapeHtml(error.message || (normalizedKind === "pod" ? t("POD lookup failed.") : t("BOL lookup failed.")))}</div>`);
  }
}

async function openCarrierShipmentDocuments(entityId, kind = "bol") {
  const normalizedKind = String(kind || "bol").toLowerCase() === "pod" ? "pod" : "bol";
  const title = normalizedKind === "pod"
    ? t("Proof of Delivery {id}", { id: entityId })
    : t("Bill of Lading {id}", { id: entityId });
  openModal(title, `<div class="empty-state">${escapeHtml(normalizedKind === "pod" ? t("Loading proof of delivery...") : t("Loading bill of lading..."))}</div>`);
  try {
    const response = await api(`/api/mothership/documents/${entityId}`);
    if (!state.modal || state.modal.title !== title) {
      return;
    }
    const allDocuments = Array.isArray(response.documents) ? response.documents : [];
    const documents = filterShipmentDocumentsByKind(allDocuments, normalizedKind);
    const notice = normalizedKind === "pod"
      ? (documents.length > 0
          ? response.message || ""
          : t("POD is not here yet."))
      : (response.message || (documents.length === 0 ? t("No bill of lading was returned for this shipment yet.") : ""));
    paintModal(title, shipmentDocumentsHtml(
      {
        id: entityId,
        confirmationNumber: entityId,
        referenceNumber: "",
        carrier: "mothership"
      },
      documents,
      notice,
      normalizedKind
    ));
  } catch (error) {
    if (!state.modal || state.modal.title !== title) {
      return;
    }
    paintModal(title, `<div class="empty-state">${escapeHtml(error.message || (normalizedKind === "pod" ? t("POD lookup failed.") : t("BOL lookup failed.")))}</div>`);
  }
}

async function openQuoteDetails(quoteId) {
  const quote = state.quotes.find((item) => item.id === quoteId);
  if (!quote) {
    return;
  }

  openModal(t("Quote Details"), quoteDetailsHtml(quote));
}

function reenterQuote(quoteId) {
  const quote = state.quotes.find((item) => item.id === quoteId);
  if (!quote) {
    return;
  }

  closeModal();
  state.currentQuote = null;
  state.pendingQuoteReentry = quote.id;
  setView("quote");
  window.requestAnimationFrame(() => {
    populateQuoteFormFromQuote(quote);
    clearQuoteFormErrors(document.getElementById("quoteForm"));
    state.pendingQuoteReentry = null;
    const results = document.getElementById("quoteResults");
    if (results) {
      results.classList.add("empty-state");
      results.textContent = t("Submit a quote to see available rates.");
    }
    showToast(t("Quote details copied into New Quote."));
  });
}

function openBookingConfirmation(quoteId, rateId) {
  const quote = state.currentQuote || state.quotes.find((item) => item.id === quoteId);
  if (!quote) {
    return;
  }

  const rate = Array.isArray(quote.rates) ? quote.rates.find((item) => item.id === rateId) : null;
  if (!rate) {
    return;
  }

  if (isCustomerUser() && !customerBookingAllowed(quote.customerId, rate.carrierSource || quote.carrierMode)) {
    showToast(t("Shipment booking is disabled for this carrier."), true);
    return;
  }

  state.pendingBooking = { quoteId, rateId };
  openModal(t("Confirm Shipment Booking"), bookingConfirmationHtml(quote, rate));
}

function cancelPendingBooking() {
  state.pendingBooking = null;
  closeModal();
}

async function confirmPendingBooking() {
  const pending = state.pendingBooking;
  if (!pending) {
    return;
  }

  const quote = state.currentQuote || state.quotes.find((item) => item.id === pending.quoteId);
  if (!quote) {
    cancelPendingBooking();
    return;
  }

  const rate = Array.isArray(quote.rates) ? quote.rates.find((item) => item.id === pending.rateId) : null;
  if (!rate) {
    cancelPendingBooking();
    return;
  }

  const purchaseSummary = summarizeMothershipPurchaseMetadata(mothershipPurchaseMetadata(quote, rate));
  if (purchaseSummary && purchaseSummary.purchasable === false) {
    cancelPendingBooking();
    showToast(purchaseSummary.invalidFields.length > 0 ? `Mothership needs: ${purchaseSummary.invalidFields.join("; ")}` : t("This Mothership quote is not purchasable yet."), true);
    return;
  }

  if (isCustomerUser() && !customerBookingAllowed(quote.customerId, rate.carrierSource || quote.carrierMode)) {
    cancelPendingBooking();
    showToast(t("Shipment booking is disabled for this carrier."), true);
    return;
  }

  state.pendingBooking = null;
  closeModal();
  await finalizeBooking(quote.id, rate.id);
}

async function openInvoiceDetails(invoiceId) {
  const invoice = state.invoices.find((item) => item.id === invoiceId);
  if (!invoice) {
    return;
  }

  const shipment = resolveInvoiceShipment(invoice);
  openModal(`${t("Invoice")} ${invoice.invoiceNumber}`, invoiceDetailsHtml(invoice, shipment));
}

function openCustomerEditor(customerId) {
  const customer = state.customers.find((item) => item.id === customerId);
  const tariff = state.tariffs.find((rule) => rule.customerId === customerId) || {
    ruleType: "percentage",
    fixedAmount: 0,
    markupPercentage: 0
  };

  if (!customer) {
    return;
  }

  openModal(
    `${t("Edit")} ${customer.companyName}`,
    `
      <form id="customerEditForm" class="modal-grid">
        <label>
          ${t("Company name")}
          <input name="companyName" required value="${escapeHtml(customer.companyName)}">
        </label>
        <label>
          ${t("Billing email")}
          <input name="billingEmail" value="${escapeHtml(customer.billingEmail || "")}">
        </label>
        <label>
          ${t("Payment terms")}
          <input name="paymentTerms" value="${escapeHtml(customer.paymentTerms || "Net 15")}">
        </label>
        <label>
          ${t("Company phone")}
          <input name="companyPhone" type="tel" inputmode="numeric" autocomplete="tel" value="${escapeHtml(customer.companyPhone || "")}" placeholder="(555) 123-4567">
        </label>
        <label class="span-2">
          ${t("Company street")}
          <input name="companyStreet" value="${escapeHtml(customer.companyStreet || "")}" placeholder="123 Main St">
        </label>
        <label>
          ${t("Company city")}
          <input name="companyCity" value="${escapeHtml(customer.companyCity || "")}" placeholder="City">
        </label>
        <label>
          ${t("Company state")}
          <input name="companyState" value="${escapeHtml(customer.companyState || "")}" placeholder="CA" maxlength="2">
        </label>
        <label>
          ${t("Company ZIP")}
          <input name="companyZip" value="${escapeHtml(customer.companyZip || "")}" placeholder="ZIP">
        </label>
        <label>
          ${t("Open")}
          <select name="companyOpenTime" data-time-select>
            <option value="">${t("Select time")}</option>
          </select>
        </label>
        <label>
          ${t("Close")}
          <select name="companyCloseTime" data-time-select>
            <option value="">${t("Select time")}</option>
          </select>
        </label>
        <label>
          ${t("Portal username")}
          <input name="portalEmail" value="${escapeHtml(customer.portalEmail || "")}">
        </label>
        <label>
          ${t("Portal password")}
          <input name="portalPassword" type="password" placeholder="Leave blank to keep current password">
        </label>
        <label>
          ${t("Account status")}
          <select name="status">
            <option value="active" ${customer.status === "active" ? "selected" : ""}>${t("Active")}</option>
            <option value="disabled" ${customer.status === "disabled" ? "selected" : ""}>${t("Disabled")}</option>
          </select>
        </label>
        <label>
          ${t("Tariff rule")}
          <select name="ruleType">
            <option value="fixed" ${tariff.ruleType === "fixed" ? "selected" : ""}>${t("Fixed markup")}</option>
            <option value="percentage" ${tariff.ruleType === "percentage" ? "selected" : ""}>${t("Percentage markup")}</option>
          </select>
        </label>
        <label>
          ${t("Fixed amount")}
          <input name="fixedAmount" type="number" min="0" step="0.01" value="${escapeHtml(String(tariff.fixedAmount ?? 0))}">
        </label>
        <label>
          ${t("Markup percent")}
          <input name="markupPercentage" type="number" min="0" step="0.1" value="${escapeHtml(String(tariff.markupPercentage ?? 0))}">
        </label>
        <div class="modal-actions">
          <button class="primary-action" type="submit">${t("Save Changes")}</button>
        </div>
      </form>
    `
  );
  populateTimeSelects();
  const openTimeField = document.querySelector("#customerEditForm [name='companyOpenTime']");
  const closeTimeField = document.querySelector("#customerEditForm [name='companyCloseTime']");
  if (openTimeField) {
    openTimeField.value = customer.companyOpenTime || "";
  }
  if (closeTimeField) {
    closeTimeField.value = customer.companyCloseTime || "";
  }
  wireZipAutofill();
  triggerZipAutofillField("companyZip", document.getElementById("customerEditForm"));

  document.getElementById("customerEditForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api(`/api/customers/${customer.id}`, {
      method: "PATCH",
      body: {
        companyName: form.get("companyName"),
        billingEmail: form.get("billingEmail"),
        paymentTerms: form.get("paymentTerms"),
        companyPhone: form.get("companyPhone"),
        companyOpenTime: form.get("companyOpenTime"),
        companyCloseTime: form.get("companyCloseTime"),
        companyStreet: form.get("companyStreet"),
        companyCity: form.get("companyCity"),
        companyState: form.get("companyState"),
        companyZip: form.get("companyZip"),
        portalEmail: form.get("portalEmail"),
        portalPassword: form.get("portalPassword"),
        status: form.get("status"),
        ruleType: form.get("ruleType"),
        fixedAmount: form.get("fixedAmount"),
        markupPercentage: form.get("markupPercentage")
      }
    });
    closeModal();
    showToast(t("Customer updated."));
    await refreshAll();
  });
}

async function toggleCustomerStatus(customerId) {
  const customer = state.customers.find((item) => item.id === customerId);
  if (!customer) {
    return;
  }

  const nextStatus = customer.status === "disabled" ? "active" : "disabled";
  await api(`/api/customers/${customerId}`, {
    method: "PATCH",
    body: { status: nextStatus }
  });
  showToast(t("Customer {status}.", { status: nextStatus }));
  await refreshAll();
}

async function deleteCustomerAccount(customerId) {
  const customer = state.customers.find((item) => item.id === customerId);
  if (!customer) {
    return;
  }

  if (!window.confirm(t("Delete {name}? This removes the customer and related data.", { name: customer.companyName }))) {
    return;
  }

  await api(`/api/customers/${customerId}`, {
    method: "DELETE"
  });
  showToast(t("Customer deleted."));
  await refreshAll();
}

function customerSummaryHtml() {
  if (state.customers.length === 0) {
    return `<div class="empty-state">${t("No customers yet.")}</div>`;
  }

  return `
    <div class="modal-grid">
      ${state.customers
        .map((customer) => {
          const tariff = state.tariffs.find((rule) => rule.customerId === customer.id);
          const bookingModes = customerAllowedBookingModes(customer);
          return `
            <article class="row-item">
              <div>
                <strong>${escapeHtml(customer.companyName)}</strong>
                <small>${escapeHtml(customer.billingEmail || t("No billing email"))} · ${escapeHtml(customer.paymentTerms)}</small>
                <div class="meta-line">
                  <span class="pill">${escapeHtml(customer.portalEmail || t("No portal user"))}</span>
                  <span class="pill">${escapeHtml(customer.status)}</span>
                  ${(customer.companyStreet || customer.companyCity || customer.companyState || customer.companyZip)
                    ? `<span class="pill">${escapeHtml([customer.companyStreet, customer.companyCity, customer.companyState, customer.companyZip].filter(Boolean).join(", "))}</span>`
                    : ""}
                  ${customer.companyPhone ? `<span class="pill">${escapeHtml(customer.companyPhone)}</span>` : ""}
                  ${customerHoursRange(customer) ? `<span class="pill">${escapeHtml(customerHoursRange(customer))}</span>` : ""}
                  <span class="pill">${bookingModes.length > 0 ? `${t("Booking")}: ${escapeHtml(carrierModeListLabel(bookingModes, false))}` : t("Booking disabled")}</span>
                  <span class="pill">${escapeHtml(tariff?.ruleType || t("no tariff"))}</span>
                  <span class="pill">${money.format(Number(tariff?.fixedAmount || 0))} ${t("fixed")}</span>
                  <span class="pill">${Number(tariff?.markupPercentage || 0)}% ${t("markup")}</span>
                </div>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function quoteSummaryHtml() {
  if (state.quotes.length === 0) {
    return `<div class="empty-state">No quotes yet.</div>`;
  }

  return `
    <div class="modal-grid">
      ${state.quotes
        .slice(0, 50)
        .map((quote) => quoteRow(quote))
        .join("")}
    </div>
  `;
}

function shipmentSummaryHtml() {
  if (state.shipments.length === 0) {
    return `<div class="empty-state">No shipments yet.</div>`;
  }

  return `
    <div class="modal-grid">
      ${state.shipments
        .slice(0, 50)
        .map((shipment) => shipmentRow(shipment))
        .join("")}
    </div>
  `;
}

function invoiceSummaryHtml() {
  if (state.invoices.length === 0) {
    return `<div class="empty-state">No invoices yet.</div>`;
  }

  return `
    <div class="modal-grid">
      ${state.invoices
        .slice(0, 50)
        .map((invoice) => invoiceRow(invoice))
        .join("")}
    </div>
  `;
}

function renderDashboardSupportPanel() {
  const heading = document.getElementById("dashboardSupportHeading");
  const body = document.getElementById("dashboardSupportBody");
  if (!heading || !body) {
    return;
  }

  if (isStaffUser()) {
    heading.textContent = t("Next Setup Steps");
    body.innerHTML = `
      <ul class="check-list">
        <li>${t("Add real customers.")}</li>
        <li>${t("Set customer markup rules.")}</li>
        <li>${t("Add your Mothership sandbox token to backend env.")}</li>
        <li>${t("Run one sandbox quote before enabling carrier booking.")}</li>
      </ul>
    `;
    return;
  }

  heading.textContent = t("My Portal");
  const recentQuotes = state.quotes.slice(0, 3);
  const recentInvoices = state.invoices.slice(0, 3);
  body.innerHTML = `
    <div class="portal-grid">
      <section class="portal-card">
        <div class="panel-heading compact">
          <h3>${t("Recent Quotes")}</h3>
        </div>
        <div class="portal-stack">
          ${recentQuotes.length ? recentQuotes.map((quote) => quoteRow(quote, { showActions: true })).join("") : `<div class="empty-state">${t("No quotes yet.")}</div>`}
        </div>
      </section>
      <section class="portal-card">
        <div class="panel-heading compact">
          <h3>${t("Recent Invoices")}</h3>
        </div>
        <div class="portal-stack">
          ${recentInvoices.length ? recentInvoices.map((invoice) => invoiceRow(invoice, { showActions: true })).join("") : `<div class="empty-state">${t("No invoices yet.")}</div>`}
        </div>
      </section>
    </div>
  `;
}

function autofillPickupFromCustomer(customerId, force = false) {
  const customer = state.customers.find((item) => item.id === customerId);
  if (!customer) {
    return;
  }

  const values = {
    pickupName: customer.companyName || "",
    pickupPhone: customer.companyPhone || "",
    pickupOpen: customer.companyOpenTime || "",
    pickupClose: customer.companyCloseTime || "",
    pickupStreet: customer.companyStreet || "",
    pickupCity: customer.companyCity || "",
    pickupState: customer.companyState || "",
    pickupZip: customer.companyZip || ""
  };

  if (!Object.values(values).some((value) => String(value || "").trim())) {
    return;
  }

  Object.entries(values).forEach(([name, value]) => {
    const input = document.querySelector(`[name='${name}']`);
    if (!input) {
      return;
    }
    const nextValue = String(value || "").trim();
    if (nextValue && (force || !String(input.value || "").trim())) {
      input.value = value;
    }
  });

  triggerZipAutofillField("pickupZip");
}

function isPickupAutofillEmpty() {
  const fieldNames = [
    "pickupName",
    "pickupPhone",
    "pickupOpen",
    "pickupClose",
    "pickupStreet",
    "pickupCity",
    "pickupState",
    "pickupZip"
  ];
  return fieldNames.every((name) => {
    const input = document.querySelector(`[name='${name}']`);
    return !String(input?.value || "").trim();
  });
}

function customerHoursRange(customer) {
  if (!customer?.companyOpenTime && !customer?.companyCloseTime) {
    return "";
  }

  const openLabel = customer.companyOpenTime ? formatTimeHour(customer.companyOpenTime) : t("Open");
  const closeLabel = customer.companyCloseTime ? formatTimeHour(customer.companyCloseTime) : t("Close");
  return `${openLabel} - ${closeLabel}`;
}

function renderQuotePreview() {
  return;
  const preview = document.getElementById("quotePreview");
  const form = document.getElementById("quoteForm");
  if (!preview || !form) {
    return;
  }

  const values = new FormData(form);
  const customerId = String(values.get("customerId") || state.user?.customerId || "");
  const customer = state.customers.find((item) => item.id === customerId) || null;
  const customerLabel = customer?.companyName || (isCustomerUser() ? t("Your account") : t("Select a customer"));
  const carrierMode = values.get("carrierMode") === "mothershipSandbox" ? t("Mothership sandbox") : t("Demo rates");
  const booking = values.get("bookWithCarrier") ? t("Book after quote") : t("Quote only");
  const pickup = locationSummary(values, "pickup");
  const delivery = locationSummary(values, "delivery");
  const freight = freightSummary(values);
  const pickupAccessorials = splitAccessorials(values.get("pickupAccessorials"));
  const deliveryAccessorials = splitAccessorials(values.get("deliveryAccessorials"));
  const accessorials = [...pickupAccessorials, ...deliveryAccessorials];

  preview.classList.remove("empty-state");
  preview.innerHTML = `
    <div class="quote-preview-grid">
      ${previewItem(t("Customer"), customerLabel)}
      ${previewItem(t("Carrier mode"), carrierMode)}
      ${previewItem(t("Booking"), booking)}
      ${previewItem(t("Pickup"), pickup)}
      ${previewItem(t("Delivery"), delivery)}
      ${previewItem(t("Freight"), freight)}
      ${previewItem(t("Accessorials"), accessorials.length ? accessorials.join(", ") : t("None"))}
    </div>
  `;
}

function previewItem(label, value) {
  return `
    <article class="quote-preview-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "—")}</strong>
    </article>
  `;
}

function locationSummary(values, prefix) {
  const city = String(values.get(`${prefix}City`) || "").trim();
  const stateValue = String(values.get(`${prefix}State`) || "").trim();
  const street = String(values.get(`${prefix}Street`) || "").trim();
  if (!city && !stateValue && !street) {
    return "Enter location details";
  }
  const cityState = [city, stateValue].filter(Boolean).join(", ");
  return [street, cityState].filter(Boolean).join(" · ") || "Enter location details";
}

function freightRows() {
  return Array.from(document.querySelectorAll("[data-freight-row]"));
}

function freightRowField(row, field) {
  return row?.querySelector(`[data-freight-field='${field}']`) || null;
}

function freightRowFlag(row, flag) {
  return row?.querySelector(`[data-freight-flag='${flag}']`) || null;
}

function renumberFreightRows() {
  freightRows().forEach((row, index) => {
    const title = row.querySelector("[data-freight-row-title]");
    if (title) {
      title.textContent = `Item ${index + 1}`;
    }
    const removeButton = row.querySelector("[data-remove-freight-row]");
    if (removeButton) {
      removeButton.disabled = freightRows().length <= 1;
    }
  });
}

function createFreightRow(values = {}) {
  const template = document.getElementById("freightRowTemplate");
  if (!(template instanceof HTMLTemplateElement)) {
    return null;
  }

  const fragment = template.content.cloneNode(true);
  const row = fragment.querySelector("[data-freight-row]");
  if (!row) {
    return null;
  }

  const defaults = {
    quantity: "",
    type: "",
    pieces: "1",
    weight: "",
    freightClass: "",
    nmfc: "",
    length: "",
    width: "",
    height: "",
    description: "",
    stackable: false,
    hazmat: false,
    used: false,
    machinery: false
  };
  const nextValues = { ...defaults, ...values };

  Object.entries(nextValues).forEach(([key, value]) => {
    const control = freightRowField(row, key);
    if (control) {
      control.value = value ?? "";
    }
    const flag = freightRowFlag(row, key);
    if (flag) {
      flag.checked = Boolean(value);
    }
  });

  translateSubtree(row);
  updateFreightUnitLabels(row);

  return row;
}

function addFreightRow(values = {}) {
  const container = document.getElementById("freightRows");
  if (!container) {
    return;
  }

  const row = createFreightRow(values);
  if (!row) {
    return;
  }

  container.appendChild(row);
  renumberFreightRows();
  updateFreightClassSuggestion(row);
}

function removeFreightRow(row) {
  if (!row) {
    return;
  }

  const rows = freightRows();
  if (rows.length <= 1) {
    return;
  }

  if (freightSuggestionTimers.has(row)) {
    clearTimeout(freightSuggestionTimers.get(row));
    freightSuggestionTimers.delete(row);
  }
  freightSuggestionTokens.delete(row);
  row.remove();
  renumberFreightRows();
  updateFreightClassSuggestion();
}

function ensureFreightRows() {
  if (freightRows().length > 0) {
    renumberFreightRows();
    return;
  }
  addFreightRow();
}

function freightRowData(row) {
  const raw = freightRowRawData(row);
  return convertFreightRowValues(raw, state.freightUnits, "imperial");
}

function freightRowRawData(row) {
  const quantity = Number(freightRowField(row, "quantity")?.value || 0);
  const weight = Number(freightRowField(row, "weight")?.value || 0);
  const pieces = Number(freightRowField(row, "pieces")?.value || 0);
  const length = Number(freightRowField(row, "length")?.value || 0);
  const width = Number(freightRowField(row, "width")?.value || 0);
  const height = Number(freightRowField(row, "height")?.value || 0);

  return {
    quantity,
    type: String(freightRowField(row, "type")?.value || "").trim(),
    pieces,
    weight,
    freightClass: String(freightRowField(row, "freightClass")?.value || "").trim(),
    nmfc: String(freightRowField(row, "nmfc")?.value || "").trim(),
    length,
    width,
    height,
    description: String(freightRowField(row, "description")?.value || "").trim(),
    stackable: Boolean(freightRowFlag(row, "stackable")?.checked),
    hazmat: Boolean(freightRowFlag(row, "hazmat")?.checked),
    used: Boolean(freightRowFlag(row, "used")?.checked),
    machinery: Boolean(freightRowFlag(row, "machinery")?.checked)
  };
}

function freightSummary() {
  const rows = freightRows();
  if (rows.length === 0) {
    return "Add freight details";
  }

  const config = getFreightUnitConfig();
  const parts = rows.map((row) => {
    const data = freightRowRawData(row);
    const totalWeight = data.quantity && data.weight ? data.quantity * data.weight : 0;
    const quantityText = data.quantity ? `${data.quantity} ${String(data.type || "item").toLowerCase()}${data.quantity === 1 ? "" : "s"}` : "0 items";
    const classText = data.freightClass ? `Class ${data.freightClass}` : "Set class";
    const weightText = data.weight ? `${data.weight} ${config.weightSummaryUnit}${totalWeight ? ` (${totalWeight} ${config.totalWeightSummaryUnit})` : ""}` : "Set weight";
    const sizeText = data.length && data.width && data.height ? `${data.length} x ${data.width} x ${data.height} ${config.dimensionSummaryUnit}` : "Set dimensions";
    return `${quantityText} · ${classText} · ${weightText} · ${sizeText}`;
  });

  return parts.join(" | ");
}

function updateFreightClassSuggestion(targetRow = null) {
  const form = document.getElementById("quoteForm");
  if (!form) {
    return;
  }

  const rows = targetRow ? [targetRow] : freightRows();
  rows.forEach((row) => updateFreightRowSuggestion(form, row));
}

function clearFreightSuggestionTimer(row) {
  if (freightSuggestionTimers.has(row)) {
    clearTimeout(freightSuggestionTimers.get(row));
    freightSuggestionTimers.delete(row);
  }
}

function clearFreightSuggestionState(row) {
  clearFreightSuggestionTimer(row);
  freightSuggestionTokens.delete(row);
}

function setFreightSuggestionDisplay(row, value, source = "", accepted = false) {
  const suggestion = row?.querySelector("[data-freight-suggestion]");
  if (!suggestion) {
    return;
  }

  if (!value) {
    suggestion.textContent = t("Suggested freight class: enter quantity, weight, and dimensions to calculate one.");
    suggestion.dataset.value = "";
    suggestion.dataset.source = "";
    suggestion.dataset.accepted = "false";
    return;
  }

  suggestion.dataset.value = value;
  suggestion.dataset.source = String(source || "local");
  suggestion.dataset.accepted = accepted ? "true" : "false";
  suggestion.textContent = t("Suggested freight class: {value}", { value });
}

async function resolveFreightRowSuggestion(form, row) {
  const data = freightRowData(row);
  const suggestionValue = suggestFreightClass(data);
  if (!suggestionValue) {
    return { value: "", source: "" };
  }

  const payload = {
    quantity: data.quantity,
    weight: data.weight,
    length: data.length,
    width: data.width,
    height: data.height,
    customerId: getQuoteSuggestionCustomerId(form)
  };

  try {
    const response = await api("/api/freight-class-suggestion", {
      method: "POST",
      body: payload
    });
    const appliedValue = String(response.suggestedClass || suggestionValue || "").trim();
    if (!appliedValue) {
      return { value: "", source: "" };
    }
    return { value: appliedValue, source: String(response.source || "local") };
  } catch {
    return { value: suggestionValue, source: "local" };
  }
}

function updateFreightRowSuggestion(form, row) {
  if (!row) {
    return;
  }

  const suggestion = row.querySelector("[data-freight-suggestion]");
  if (!suggestion) {
    return;
  }

  clearFreightSuggestionTimer(row);

  const data = freightRowData(row);
  const suggestionValue = suggestFreightClass(data);
  if (!suggestionValue) {
    setFreightSuggestionDisplay(row, "", "", false);
    freightSuggestionTokens.set(row, (freightSuggestionTokens.get(row) || 0) + 1);
    return;
  }

  suggestion.textContent = t("Suggested freight class: calculating...");
  suggestion.dataset.value = "";
  suggestion.dataset.source = "";
  suggestion.dataset.accepted = "false";

  const requestToken = (freightSuggestionTokens.get(row) || 0) + 1;
  freightSuggestionTokens.set(row, requestToken);

  const timer = setTimeout(async () => {
    try {
      const result = await resolveFreightRowSuggestion(form, row);
      if (requestToken !== freightSuggestionTokens.get(row)) {
        return;
      }

      if (!result.value) {
        setFreightSuggestionDisplay(row, "", "", false);
        return;
      }

      setFreightSuggestionDisplay(row, result.value, result.source, false);
    } catch {
      if (requestToken !== freightSuggestionTokens.get(row)) {
        return;
      }
      setFreightSuggestionDisplay(row, suggestionValue, "local", false);
    }
  }, 300);

  freightSuggestionTimers.set(row, timer);
}

function wireZipAutofill() {
  document.querySelectorAll("[data-zip-autofill]").forEach((input) => {
    if (input.dataset.zipAutofillBound === "true") {
      return;
    }

    const prefix = String(input.dataset.zipAutofill || "").trim();
    if (!prefix) {
      return;
    }

    const scheduleLookup = (immediate = false) => {
      const form = input.closest("form");
      if (!form) {
        return;
      }

      if (zipLookupTimers.has(input)) {
        clearTimeout(zipLookupTimers.get(input));
      }

      const normalizedZip = normalizeZipLookupValue(input.value);
      if (!normalizedZip) {
        fillZipTargets(form, prefix, "", "");
        zipLookupTokens.set(input, (zipLookupTokens.get(input) || 0) + 1);
        return;
      }

      const runLookup = async () => {
        const token = (zipLookupTokens.get(input) || 0) + 1;
        zipLookupTokens.set(input, token);
        try {
          const response = await api(`/api/zip-lookup?zip=${encodeURIComponent(normalizedZip)}`, { public: true });
          if (zipLookupTokens.get(input) !== token) {
            return;
          }
          fillZipTargets(form, prefix, response.city || "", response.state || "");
        } catch {
          if (zipLookupTokens.get(input) !== token) {
            return;
          }
        }
      };

      const timer = setTimeout(runLookup, immediate ? 0 : 300);
      zipLookupTimers.set(input, timer);
    };

    input.addEventListener("input", () => scheduleLookup(false));
    input.addEventListener("change", () => scheduleLookup(true));
    input.addEventListener("blur", () => scheduleLookup(true));
    input.dataset.zipAutofillBound = "true";

    if (normalizeZipLookupValue(input.value)) {
      scheduleLookup(true);
    }
  });
}

function fillZipTargets(form, prefix, city, stateValue) {
  const cityControl = form.querySelector(`[name='${prefix}City']`);
  const stateControl = form.querySelector(`[name='${prefix}State']`);
  if (cityControl) {
    cityControl.value = city || "";
  }
  if (stateControl) {
    stateControl.value = String(stateValue || "").toUpperCase();
  }
}

function normalizeZipLookupValue(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 5) {
    return "";
  }
  return digits.slice(0, 5);
}

async function applySuggestedFreightClass(row) {
  if (!row) {
    return;
  }

  const suggestion = row.querySelector("[data-freight-suggestion]");
  const existingValue = String(suggestion?.dataset.value || "").trim();
  const form = row.closest("form");
  const result = existingValue
    ? null
    : form
      ? await resolveFreightRowSuggestion(form, row)
      : null;
  const value = existingValue || String(result?.value || "").trim();
  if (!value) {
    return;
  }

  const control = freightRowField(row, "freightClass");
  if (control) {
    control.value = value;
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }
  setFreightSuggestionDisplay(row, value, suggestion?.dataset.source || result?.source || "local", true);
}

async function applyAllFreightClassSuggestions() {
  const form = document.getElementById("quoteForm");
  if (!form) {
    return;
  }

  const rows = freightRows();
  if (rows.length === 0) {
    return;
  }

  rows.forEach((row) => clearFreightSuggestionTimer(row));
  const results = await Promise.all(rows.map((row) => resolveFreightRowSuggestion(form, row)));
  let appliedCount = 0;

  rows.forEach((row, index) => {
    const result = results[index];
    if (!result?.value) {
      return;
    }

    clearFreightSuggestionState(row);
    const control = freightRowField(row, "freightClass");
    if (control) {
      control.value = result.value;
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setFreightSuggestionDisplay(row, result.value, result.source, true);
    appliedCount += 1;
  });

  if (appliedCount > 0) {
    showToast(t("Applied freight class suggestions to {count} item{suffix}.", {
      count: appliedCount,
      suffix: appliedCount === 1 ? "" : "s"
    }));
  } else {
    showToast(t("Add quantity, weight, and dimensions to calculate freight class suggestions."), true);
  }
}

function getQuoteSuggestionCustomerId(form) {
  const selected = String(form.querySelector("[name='customerId']")?.value || "").trim();
  if (selected) {
    return selected;
  }
  return isCustomerUser() ? String(state.user?.customerId || "").trim() : "";
}

function suggestFreightClass(values) {
  const quantity = Number(values.quantity || 0);
  const weight = Number(values.weight || 0);
  const length = Number(values.length || 0);
  const width = Number(values.width || 0);
  const height = Number(values.height || 0);

  if (!quantity || !weight || !length || !width || !height) {
    return "";
  }

  const totalWeight = quantity * weight;
  const cubicFeet = (quantity * length * width * height) / 1728;
  if (!cubicFeet || !Number.isFinite(cubicFeet)) {
    return "";
  }

  const density = totalWeight / cubicFeet;
  const densityBands = [
    { min: 50, classValue: "50" },
    { min: 35, classValue: "55" },
    { min: 30, classValue: "60" },
    { min: 22.5, classValue: "65" },
    { min: 15, classValue: "70" },
    { min: 13.5, classValue: "77.5" },
    { min: 12, classValue: "85" },
    { min: 10.5, classValue: "92.5" },
    { min: 9, classValue: "100" },
    { min: 8, classValue: "110" },
    { min: 7, classValue: "125" },
    { min: 6, classValue: "150" },
    { min: 5, classValue: "175" },
    { min: 4, classValue: "200" },
    { min: 3, classValue: "250" },
    { min: 2, classValue: "300" },
    { min: 1, classValue: "400" },
    { min: 0, classValue: "500" }
  ];

  const matched = densityBands.find((band) => density >= band.min);
  return matched?.classValue || "";
}

function quoteRow(quote, options = {}) {
  const showActions = options.showActions !== false;
  return `
    <article class="row-item">
      <div>
        <strong>${escapeHtml(quote.customerName)}</strong>
        <div class="meta-line">
          <span class="pill">${formatDate(quote.createdAt)}</span>
          <span class="pill">${escapeHtml(quote.pickup?.address?.city || "")} → ${escapeHtml(quote.delivery?.address?.city || "")}</span>
        </div>
      </div>
      ${showActions ? `
        <div class="row-actions">
          <button class="secondary-action" type="button" data-view-quote="${escapeHtml(quote.id)}">${t("View Quote")}</button>
        </div>
      ` : ""}
    </article>
  `;
}

function shipmentRow(shipment, options = {}) {
  const showActions = options.showActions !== false;
  const priceLabel = customerPriceLabel();
  const carrierLabel = shipmentCarrierLabel(shipment);
  const statusPill = shipment.status === "booked_with_carrier" ? "" : `<span class="pill">${escapeHtml(shipment.status)}</span>`;
  return `
    <article class="row-item">
      <div>
        <strong>${escapeHtml(shipment.confirmationNumber)}</strong>
        <small>${escapeHtml(shipment.customerName)} · ${escapeHtml(shipment.pickup.address.city)}, ${escapeHtml(shipment.pickup.address.state)} to ${escapeHtml(shipment.delivery.address.city)}, ${escapeHtml(shipment.delivery.address.state)}</small>
        <div class="meta-line">
          ${statusPill}
          <span class="pill">${escapeHtml(carrierLabel)}</span>
          ${shipment.referenceNumber ? `<span class="pill">${t("PO")} ${escapeHtml(shipment.referenceNumber)}</span>` : ""}
          <span class="pill">${formatDate(shipment.createdAt)}</span>
          <span class="pill">${priceLabel} ${money.format(shipment.sellPrice)}</span>
        </div>
      </div>
      ${showActions ? `
        <div class="row-actions">
          <button class="secondary-action" type="button" data-track-shipment="${escapeHtml(shipment.id)}">${t("Track")}</button>
          <button class="secondary-action" type="button" data-view-bol="${escapeHtml(shipment.id)}">${t("BOL")}</button>
          <button class="secondary-action" type="button" data-view-pod="${escapeHtml(shipment.id)}">${t("POD")}</button>
        </div>
      ` : ""}
    </article>
  `;
}

function shipmentCarrierLabel(shipment) {
  const customerView = isCustomerUser();
  const explicitName = String(shipment?.carrierName || "").trim();
  if (explicitName) {
    if (customerView && explicitName.toLowerCase().includes("mothership")) {
      return t("Self-owned Truck");
    }
    return explicitName;
  }
  return carrierDisplayName(shipment?.provider || shipment?.carrier || "", shipment?.carrier || "", customerView);
}

function invoiceRow(invoice, options = {}) {
  const showActions = options.showActions !== false;
  const sourceLabel = invoice.source === "mothership" ? t("Mothership") : t("Local");
  const referenceOnly = isImportedInvoiceReference(invoice);
  const podTarget = resolveInvoiceDocumentTarget(invoice);
  const shipment = podTarget.localShipment;
  const subLabel = podTarget.displayLabel
    ? `${escapeHtml(invoice.customerName)} · ${escapeHtml(podTarget.displayLabel)}`
    : referenceOnly
      ? `${escapeHtml(sourceLabel)} ${t("invoice reference")}`
      : `${escapeHtml(invoice.customerName)} · ${escapeHtml(sourceLabel)} ${t("import")}`;
  return `
    <article class="row-item">
      <div>
        <strong>${escapeHtml(invoice.invoiceNumber)}</strong>
        <small>${subLabel}</small>
        <div class="meta-line">
          <span class="pill">${escapeHtml(invoice.status)}</span>
          <span class="pill">${escapeHtml(sourceLabel)}</span>
          ${referenceOnly ? `<span class="pill">${t("Reference only")}</span>` : ""}
          ${invoice.referenceNumber ? `<span class="pill">PO ${escapeHtml(invoice.referenceNumber)}</span>` : ""}
          <span class="pill">${formatDate(invoice.createdAt)}</span>
        </div>
      </div>
      <div class="price-block">
        ${referenceOnly ? `<small>${t("Waiting for detail fields")}</small>` : ""}
        <strong>${referenceOnly ? t("Pending") : money.format(invoice.amount)}</strong>
        ${showActions ? `
          <div class="row-actions">
            <button class="secondary-action" type="button" data-view-invoice="${escapeHtml(invoice.id)}">${referenceOnly ? t("View Payload") : t("View Invoice")}</button>
            ${invoiceCarrierDocumentActions(podTarget.entityId)}
          </div>
        ` : ""}
      </div>
    </article>
  `;
}

function detailSection(title, contentHtml) {
  return `
    <section class="detail-section">
      <h3>${escapeHtml(title)}</h3>
      <div>${contentHtml}</div>
    </section>
  `;
}

function quoteAuditRows(quote) {
  if (Array.isArray(quote?.carrierAudit) && quote.carrierAudit.length > 0) {
    return quote.carrierAudit;
  }

  if (Array.isArray(quote?.rawCarrierResponse) && quote.rawCarrierResponse.length > 0) {
    return quote.rawCarrierResponse.map((run) => ({
      mode: run.mode,
      carrier: run.carrier,
      carrierQuoteId: run.carrierQuoteId,
      carrierMessage: run.carrierMessage,
      rateCount: Array.isArray(run.rates) ? run.rates.length : 0,
      request: null,
      response: run.rawCarrierResponse
    }));
  }

  return [];
}

function quoteCarrierStatusHtml(quote) {
  const modes = quoteCarrierModesList(quote);
  const rows = quoteAuditRows(quote);
  if (modes.length === 0 && rows.length === 0) {
    return "";
  }

  const customerView = isCustomerUser();
  const rates = Array.isArray(quote?.rates) ? quote.rates : [];
  const rowsByMode = new Map(rows.map((row) => [normalizeCarrierModeValue(row.mode || row.carrier), row]));
  const displayModes = modes.length > 0 ? modes : rows.map((row) => normalizeCarrierModeValue(row.mode || row.carrier)).filter(Boolean);
  const items = Array.from(new Set(displayModes)).map((mode) => {
    const row = rowsByMode.get(normalizeCarrierModeValue(mode)) || null;
    const provider = carrierModeSummaryLabel(mode, customerView);
    const rateCount = Number.isFinite(Number(row?.rateCount))
      ? Number(row.rateCount)
      : rates.filter((rate) => normalizeCarrierModeValue(rate.carrierSource || quote.carrierMode) === normalizeCarrierModeValue(mode)).length;
    const text = carrierStatusLine(
      {
        provider,
        rateCount,
        message: row?.carrierMessage || t("Carrier returned no rates for this lane."),
        isMothership: isMothershipAuditRow(row) || normalizeCarrierModeValue(mode) === "mothershipSandbox"
      },
      t
    );
    return `<li>${escapeHtml(text)}</li>`;
  });

  if (items.length === 0) {
    return "";
  }

  return `
    <div class="carrier-status-strip" aria-live="polite">
      <strong>${t("Carrier status")}</strong>
      <ul>${items.join("")}</ul>
    </div>
  `;
}

function auditJsonBlock(value, emptyLabel = t("No data recorded.")) {
  if (value == null || (typeof value === "object" && Object.keys(value).length === 0)) {
    return `<div class="empty-state audit-empty">${escapeHtml(emptyLabel)}</div>`;
  }

  return `<pre class="audit-json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function isMothershipAuditRow(row) {
  return normalizeCarrierModeValue(row?.mode) === "mothershipSandbox" || String(row?.carrier || "").toLowerCase() === "mothership";
}

function mothershipRunForQuote(quote) {
  const runs = Array.isArray(quote?.rawCarrierResponse) ? quote.rawCarrierResponse : [];
  return runs.find((run) => isMothershipAuditRow(run)) || null;
}

function mothershipPurchaseMetadata(quote, rate = null) {
  const directMetadata = rate?.purchaseMetadata || rate?.mothershipMetadata || null;
  if (directMetadata) {
    return directMetadata;
  }

  const auditRow = Array.isArray(quote?.carrierAudit)
    ? quote.carrierAudit.find((row) => isMothershipAuditRow(row))
    : null;
  if (auditRow?.quoteMetadata) {
    return auditRow.quoteMetadata;
  }

  const run = mothershipRunForQuote(quote);
  if (!run) {
    return null;
  }

  return run.quoteMetadata || run.rawCarrierResponse?.data?.metadata || run.rawCarrierResponse?.metadata || run.response?.data?.metadata || run.response?.metadata || null;
}

function summarizeMothershipPurchaseMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const invalidFields = Array.isArray(metadata.invalidFieldsRequiredForPurchase)
    ? metadata.invalidFieldsRequiredForPurchase
        .map((item) => {
          const field = String(item?.field || "").trim();
          const errorMessage = String(item?.errorMessage || item?.message || "").trim();
          if (!field && !errorMessage) {
            return null;
          }
          return [field, errorMessage].filter(Boolean).join(": ");
        })
        .filter(Boolean)
    : [];
  const pickupSuggestedAccessorials = Array.isArray(metadata.pickupLocationSuggestedAccessorials)
    ? metadata.pickupLocationSuggestedAccessorials.filter(Boolean)
    : [];
  const deliverySuggestedAccessorials = Array.isArray(metadata.deliveryLocationSuggestedAccessorials)
    ? metadata.deliveryLocationSuggestedAccessorials.filter(Boolean)
    : [];

  return {
    purchasable: Boolean(metadata.purchasable),
    invalidFields,
    pickupSuggestedAccessorials,
    deliverySuggestedAccessorials
  };
}

function mothershipPurchaseStatusHtml(quote, rate) {
  const metadata = summarizeMothershipPurchaseMetadata(mothershipPurchaseMetadata(quote, rate));
  if (!metadata) {
    return "";
  }

  const pills = [];
  pills.push(`<span class="pill ${metadata.purchasable ? "" : "warning-pill"}">${metadata.purchasable ? t("Purchasable") : t("Not purchasable")}</span>`);

  metadata.invalidFields.forEach((field) => {
    pills.push(`<span class="pill warning-pill">${escapeHtml(field)}</span>`);
  });
  metadata.pickupSuggestedAccessorials.forEach((item) => {
    pills.push(`<span class="pill">${escapeHtml(`${t("Pickup")}: ${item}`)}</span>`);
  });
  metadata.deliverySuggestedAccessorials.forEach((item) => {
    pills.push(`<span class="pill">${escapeHtml(`${t("Delivery")}: ${item}`)}</span>`);
  });

  return `
    <div class="rate-warning-row">
      ${pills.join("")}
    </div>
  `;
}

function mothershipReferenceAuditMessage(quote, row) {
  if (!isMothershipAuditRow(row)) {
    return "";
  }

  const reference = quote?.referenceNumber ? ` ${t("TMS Reference / PO")}: ${quote.referenceNumber}.` : "";
  return `<p class="audit-message">${escapeHtml(`${reference} ${t("Mothership booking now sends only quoteId and rateId, and keeps the PO on the local shipment record.")}`)}</p>`;
}

function quoteAuditHtml(quote) {
  const customerView = isCustomerUser();
  if (customerView) {
    return "";
  }

  const rows = quoteAuditRows(quote);
  if (rows.length === 0) {
    return `<div class="empty-state audit-empty">${t("No carrier audit data recorded for this quote.")}</div>`;
  }

  return `
    <div class="audit-panel">
      ${rows
        .map(
          (row, index) => `
            <details class="audit-entry" ${index === 0 ? "open" : ""}>
              <summary>
                <span>${escapeHtml(carrierDisplayName(row.carrier || row.mode || "carrier"))}</span>
                <span class="audit-summary-meta">
                  ${escapeHtml(carrierModeSummaryLabel(row.mode || quote.carrierMode, false))}
                  ${row.rateCount ? `· ${escapeHtml(String(row.rateCount))} rates` : ""}
                  ${row.carrierQuoteId ? `· ${escapeHtml(row.carrierQuoteId)}` : ""}
                </span>
              </summary>
              <div class="audit-entry-body">
                ${row.carrierMessage ? `<p class="audit-message">${escapeHtml(row.carrierMessage)}</p>` : ""}
                ${mothershipReferenceAuditMessage(quote, row)}
                <div class="audit-grid">
                  <div class="audit-block">
                    <strong>${t("Outbound request")}</strong>
                    ${auditJsonBlock(row.request, "No outbound request recorded for this quote.")}
                  </div>
                  <div class="audit-block">
                    <strong>${t("Carrier response")}</strong>
                    ${auditJsonBlock(row.response, "No carrier response recorded for this quote.")}
                  </div>
                </div>
              </div>
            </details>
          `
        )
        .join("")}
    </div>
  `;
}

function trackingTimelineHtml(events) {
  if (!events.length) {
    return `<div class="empty-state">${t("No tracking events yet.")}</div>`;
  }

  return `
    <div class="timeline">
      ${events
        .map(
          (event) => `
            <article class="timeline-item">
              <div class="timeline-dot"></div>
              <div>
                <strong>${escapeHtml(event.status)}</strong>
                <small>${formatDateTime(event.eventTime)}${event.location ? ` · ${escapeHtml(event.location)}` : ""}</small>
                ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function freightDetailLinesHtml(freight, units = "imperial") {
  if (!Array.isArray(freight) || freight.length === 0) {
    return t("No freight details recorded.");
  }

  const config = getFreightUnitConfig(units);
  return freight
    .map((item, index) => {
      const totalWeight = Number(item.quantity || 0) * Number(item.weight || 0);
      const dimensions = [item.length, item.width, item.height].filter(Boolean).join(" x ");
      const parts = [
        `${item.quantity || ""} ${item.type || ""}`.trim(),
        item.freightClass ? `${t("Class")} ${item.freightClass}` : "",
        item.weight ? `${item.weight} ${config.weightSummaryUnit}` : "",
        totalWeight ? `(${totalWeight} ${config.totalWeightSummaryUnit})` : "",
        dimensions ? `${dimensions} ${config.dimensionSummaryUnit}` : "",
        item.description || ""
      ].filter(Boolean);

      return `${index + 1}. ${escapeHtml(parts.join(" · "))}`;
    })
    .join("<br>");
}

function quoteDetailsHtml(quote) {
  const customerView = isCustomerUser();
  const bookingAllowed = customerView ? customerBookingAllowed(quote.customerId) : true;
  const quoteCarrierModes = quoteCarrierModesList(quote);
  const sortedRates = sortedQuoteRates(quote);
  const carrierStatus = quoteCarrierStatusHtml(quote);
  const rateCards = sortedRates.length
    ? sortedRates
        .map(
          (rate) => `
            <article class="rate-item compact-rate quote-rate-card">
              <div class="rate-main">
                <div class="rate-title-row">
                  <strong>${escapeHtml(carrierNameLabel(rate, quote, customerView))}</strong>
                  <span class="service-badge">${escapeHtml(formatRateService(rate?.service))}</span>
                  <span class="carrier-badge">${escapeHtml(carrierBadgeLabel(rate.provider, rate.carrierSource || quote.carrierMode, customerView))}</span>
                </div>
                <div class="rate-meta-row">
                  ${customerView ? "" : `<span class="pill">${escapeHtml(rate.carrierSource ? carrierModeSummaryLabel(rate.carrierSource, false) : t("Carrier"))}</span>`}
                  ${customerView ? "" : `<span class="pill">${escapeHtml(rate.providerScac || t("No SCAC"))}</span>`}
                  ${customerView ? "" : `<span class="pill">${t("Offer")} ${escapeHtml(rate.carrierQuoteId || rate.carrierRateId || rate.id || "")}</span>`}
                  ${hasDisplayValue(rate.transitDays) ? `<span class="pill">${t("Transit")} ${escapeHtml(formatTransitDays(rate.transitDays))}</span>` : ""}
                  ${hasDisplayValue(rate.estimatedDeliveryDate) ? `<span class="pill">ETA ${escapeHtml(formatDate(rate.estimatedDeliveryDate))}</span>` : ""}
                  ${customerView ? "" : `<span class="pill">${t("Markup")} ${money.format(rate.markup)}</span>`}
                </div>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">${t("No rate details.")}</div>`;
  const carrierNotice = quote.carrierMessage
    ? `
      <div class="quote-status notice-state success-state">
        <strong>${t("Carrier response")}</strong>
        <p>${escapeHtml(quote.carrierMessage)}</p>
      </div>
    `
    : "";
  const bookingNotice = customerView && !bookingAllowed
    ? `
      <div class="quote-status notice-state">
        <strong>${t("Booking disabled")}</strong>
        <p>${t("Your admin has not enabled shipment booking for this account.")}</p>
      </div>
    `
    : "";
  return `
    <div class="detail-grid">
      ${detailSection(
        t("Quote Summary"),
        `
          ${carrierNotice}
          ${bookingNotice}
          ${carrierStatus}
          <p><strong>${t("Reference / PO")}:</strong> ${escapeHtml(quote.referenceNumber || "")}</p>
          ${customerView ? "" : `<p><strong>${t("Tariff")}:</strong> ${escapeHtml(quote.tariffRule?.ruleType || "n/a")} ${quote.tariffRule?.ruleType === "fixed" ? `· ${money.format(Number(quote.tariffRule?.fixedAmount || 0))}` : `· ${Number(quote.tariffRule?.markupPercentage || 0)}%`}</p>`}
          <p><strong>${t("Pickup")}:</strong> ${escapeHtml(quote.pickup?.name || "")}, ${escapeHtml(quote.pickup?.address?.street || "")}, ${escapeHtml(quote.pickup?.address?.city || "")}, ${escapeHtml(quote.pickup?.address?.state || "")}</p>
          <p><strong>${t("Delivery")}:</strong> ${escapeHtml(quote.delivery?.name || "")}, ${escapeHtml(quote.delivery?.address?.street || "")}, ${escapeHtml(quote.delivery?.address?.city || "")}, ${escapeHtml(quote.delivery?.address?.state || "")}</p>
          <p><strong>${t("Freight")}:</strong><br>${freightDetailLinesHtml(convertFreightRowsForDisplay(quote.freight, "imperial", quote.displayFreightUnits || "imperial"), quote.displayFreightUnits || "imperial")}</p>
        `
      )}
      ${customerView ? "" : detailSection(t("Quote Audit"), quoteAuditHtml(quote))}
      ${detailSection(t("Rates"), rateCards)}
      <div class="modal-actions">
        <button class="primary-action" type="button" data-reenter-quote="${escapeHtml(quote.id)}">${t("Re-enter Quote")}</button>
      </div>
    </div>
  `;
}

function bookingConfirmationHtml(quote, rate) {
  const customerView = isCustomerUser();
  const isCarrierBooking = rate?.carrierSource === "mothershipSandbox";
  const purchaseSummary = summarizeMothershipPurchaseMetadata(mothershipPurchaseMetadata(quote, rate));
  const bookingBlocked = Boolean(purchaseSummary && purchaseSummary.purchasable === false);
  const eligibilityLines = purchaseSummary
    ? [
        `<p><strong>${t("Mothership status")}:</strong> ${purchaseSummary.purchasable ? t("Purchasable") : t("Not purchasable")}</p>`,
        !purchaseSummary.purchasable && purchaseSummary.invalidFields.length > 0
          ? `<p><strong>${t("Fix these fields")}:</strong> ${escapeHtml(purchaseSummary.invalidFields.join("; "))}</p>`
          : "",
        !purchaseSummary.purchasable && purchaseSummary.pickupSuggestedAccessorials.length > 0
          ? `<p><strong>${t("Pickup suggestions")}:</strong> ${escapeHtml(purchaseSummary.pickupSuggestedAccessorials.join(", "))}</p>`
          : "",
        !purchaseSummary.purchasable && purchaseSummary.deliverySuggestedAccessorials.length > 0
          ? `<p><strong>${t("Delivery suggestions")}:</strong> ${escapeHtml(purchaseSummary.deliverySuggestedAccessorials.join(", "))}</p>`
          : ""
      ].filter(Boolean).join("")
    : "";
  return `
    <div class="booking-confirmation">
      <div class="quote-status notice-state success-state">
        <strong>${t("Confirm shipment booking")}</strong>
        <p>${isCarrierBooking ? t("This will finalize the shipment with the carrier platform.") : t("This will create a shipment booking in the TMS.")} ${t("Please confirm before continuing.")}</p>
      </div>
      ${purchaseSummary ? `
        <div class="quote-status notice-state ${bookingBlocked ? "" : "success-state"}">
          <strong>${bookingBlocked ? t("Booking blocked by Mothership") : t("Purchase eligibility")}</strong>
          ${eligibilityLines}
        </div>
      ` : ""}
      <div class="confirmation-grid">
        <div>
          <small>${t("Carrier")}</small>
          <strong>${escapeHtml(carrierNameLabel(rate, quote, customerView))}</strong>
        </div>
        <div>
          <small>${t("Service")}</small>
          <strong>${escapeHtml(formatRateService(rate?.service))}</strong>
        </div>
        <div>
          <small>${t("Reference / PO")}</small>
          <strong>${escapeHtml(quote.referenceNumber || "N/A")}</strong>
        </div>
        <div>
          <small>${t("Lane")}</small>
          <strong>${escapeHtml([quote.pickup?.address?.zip, quote.delivery?.address?.zip].filter(Boolean).join(" → ") || "N/A")}</strong>
        </div>
        <div>
          <small>${t("Cost")}</small>
          <strong>${money.format(rate.sellPrice)}</strong>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary-action" data-cancel-booking>${t("Cancel")}</button>
        <button type="button" class="primary-action" data-confirm-booking ${bookingBlocked ? "disabled" : ""}>${t("Confirm Booking")}</button>
      </div>
    </div>
  `;
}

function shipmentDetailsHtml(shipment, events = []) {
  const priceLabel = customerPriceLabel();
  const latestEvent = Array.isArray(events) && events.length ? events[events.length - 1] : null;
  const latestLabel = latestEvent
    ? `${formatDateTime(latestEvent.eventTime)}${latestEvent.location ? ` · ${escapeHtml(latestEvent.location)}` : ""}`
    : t("No tracking updates yet");
  const latestDescription =
    latestEvent && latestEvent.description && String(latestEvent.description).trim().toLowerCase() !== "shipment details updated."
      ? latestEvent.description
      : "";
  const statusPill = shipment.status === "booked_with_carrier" ? "" : `<span class="pill">${escapeHtml(shipment.status)}</span>`;
  return `
    <div class="detail-grid">
      ${detailSection(
        t("Shipment Summary"),
        `
          <div class="meta-line">
            <span class="pill">${escapeHtml(shipmentCarrierLabel(shipment))}</span>
            <span class="pill">${escapeHtml(shipment.confirmationNumber)}</span>
            ${statusPill}
          </div>
          <p><strong>${t("Reference / PO")}:</strong> ${escapeHtml(shipment.referenceNumber || "")}</p>
          <p><strong>${t("Last update")}:</strong> ${latestLabel}</p>
          ${latestDescription ? `<p>${escapeHtml(latestDescription)}</p>` : ""}
          <p><strong>${t("Pickup")}:</strong> ${escapeHtml(shipment.pickup?.name || "")}, ${escapeHtml(shipment.pickup?.address?.city || "")}, ${escapeHtml(shipment.pickup?.address?.state || "")}</p>
          <p><strong>${t("Delivery")}:</strong> ${escapeHtml(shipment.delivery?.name || "")}, ${escapeHtml(shipment.delivery?.address?.city || "")}, ${escapeHtml(shipment.delivery?.address?.state || "")}</p>
          <p><strong>${t("Freight")}:</strong><br>${freightDetailLinesHtml(convertFreightRowsForDisplay(shipment.freight, "imperial", shipment.displayFreightUnits || "imperial"), shipment.displayFreightUnits || "imperial")}</p>
          <p><strong>${escapeHtml(priceLabel)}:</strong> ${money.format(shipment.sellPrice)}</p>
        `
      )}
      ${detailSection(t("Tracking Timeline"), trackingTimelineHtml(events))}
    </div>
  `;
}

function shipmentDocumentsHtml(shipment, documents = [], notice = "", kind = "bol") {
  const normalizedKind = String(kind || "bol").toLowerCase() === "pod" ? "pod" : "bol";
  const heading = normalizedKind === "pod"
    ? t("Proof of Delivery")
    : shipment.status === "booked_with_carrier"
      ? t("Carrier Documents")
      : t("Documents");
  const documentCards = documents.length
    ? documents
        .map(
          (document) => `
            <article class="row-item document-row">
              <div>
                <strong>${escapeHtml(document.label || t("Document"))}</strong>
                <small>${escapeHtml(document.type || t("Document"))} · ${escapeHtml(document.source || shipmentCarrierLabel(shipment) || "")}</small>
                <div class="meta-line">
                  <span class="pill">${escapeHtml(document.id || "")}</span>
                </div>
              </div>
              <div class="row-actions">
                <a class="primary-action document-link" href="${escapeHtml(document.url)}" target="_blank" rel="noopener noreferrer">${t("Open document")}</a>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">${escapeHtml(notice || (normalizedKind === "pod" ? t("POD is in your actual Mothership account, please log in to download.") : t("No bill of lading was returned for this shipment yet.")))}</div>`;

  return `
    <div class="detail-grid">
      ${detailSection(
        heading,
        `
          <div class="meta-line">
            <span class="pill">${escapeHtml(shipmentCarrierLabel(shipment))}</span>
            <span class="pill">${escapeHtml(shipment.confirmationNumber)}</span>
            <span class="pill">${escapeHtml(shipment.referenceNumber || "")}</span>
          </div>
          ${documentCards}
        `
      )}
    </div>
  `;
}

function filterShipmentDocumentsByKind(documents, kind) {
  const normalizedKind = String(kind || "bol").toLowerCase() === "pod" ? "pod" : "bol";
  return (Array.isArray(documents) ? documents : []).filter((document) => {
    const label = String(document?.label || document?.type || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .toLowerCase();
    if (normalizedKind === "pod") {
      return label.includes("proof of delivery") || label.includes("pod");
    }
    return label.includes("bill of lading") || label.includes("bol");
  });
}

function invoiceDetailsHtml(invoice, shipment) {
  const sourceLabel = invoice.source === "mothership" ? t("Mothership") : t("Local");
  const referenceOnly = isImportedInvoiceReference(invoice);
  const podTarget = resolveInvoiceDocumentTarget(invoice);
  return `
    <div class="detail-grid">
      ${detailSection(
        referenceOnly ? t("Invoice Reference") : t("Invoice Summary"),
        `
          <div class="meta-line">
            <span class="pill">${escapeHtml(invoice.status)}</span>
            <span class="pill">${escapeHtml(invoice.invoiceNumber)}</span>
            <span class="pill">${escapeHtml(sourceLabel)}</span>
            ${referenceOnly ? `<span class="pill">${t("Reference only")}</span>` : ""}
            ${shipment ? `<span class="pill">${t("Shipment")} ${escapeHtml(shipment.confirmationNumber)}</span>` : ""}
          </div>
          ${referenceOnly ? `<p class="audit-message">${t("Mothership returned this record through the modified invoices feed, but the current sync does not yet have resolved amount, PO, or invoice detail fields for this item.")}</p>` : ""}
          ${invoice.externalInvoiceId ? `<p><strong>${t("Mothership invoice id")}:</strong> ${escapeHtml(invoice.externalInvoiceId)}</p>` : ""}
          <p><strong>${t("Customer")}:</strong> ${escapeHtml(invoice.customerName || "")}</p>
          <p><strong>${t("Reference / PO")}:</strong> ${escapeHtml(invoice.referenceNumber || t("Not available"))}</p>
          <p><strong>${t("Amount")}:</strong> ${referenceOnly ? t("Pending detail import") : money.format(invoice.amount)}</p>
          <p><strong>${t("Issued")}:</strong> ${formatDateTime(invoice.issuedAt || invoice.createdAt)}</p>
          <p><strong>${t("Due")}:</strong> ${formatDateTime(invoice.dueAt || null) || t("Not set")}</p>
          ${shipment ? `
            <div class="modal-actions">
              <button class="secondary-action" type="button" data-view-shipment="${escapeHtml(shipment.id)}">${t("View Shipment")}</button>
              <button class="secondary-action" type="button" data-track-shipment="${escapeHtml(shipment.id)}">${t("Track Shipment")}</button>
              ${invoiceCarrierDocumentActions(podTarget.entityId)}
            </div>
          ` : `
            <div class="modal-actions">
              ${invoiceCarrierDocumentActions(podTarget.entityId)}
            </div>
            ${podTarget.entityId ? "" : `<p class="audit-message">${t("POD is only available when Mothership returns a carrier entity ID for this invoice.")}</p>`}
          `}
        `
      )}
      ${invoice.source === "mothership" && isStaffUser() ? detailSection(
        t("Invoice Line Items"),
        invoiceLineItemsHtml(invoice.rawCarrierResponse)
      ) : ""}
      ${invoice.source === "mothership" && isStaffUser() ? detailSection(
        t("Mothership Payload"),
        `
          <p class="audit-message">${t("This raw payload is shown to admins so we can map the real Mothership invoice fields from your account.")}</p>
          ${auditJsonBlock(invoice.rawCarrierResponse, t("No raw Mothership payload was recorded for this invoice."))}
        `
      ) : ""}
    </div>
  `;
}

function invoiceLineItemsHtml(payload) {
  const items = extractMothershipInvoiceLineItems(payload);
  if (!items.length) {
    return `<div class="empty-state audit-empty">${t("No invoice line items were returned.")}</div>`;
  }

  return `
    <div class="audit-panel">
      ${items
        .slice(0, 50)
        .map(
          (item, index) => {
            const label = String(
              item?.description ||
              item?.name ||
              item?.type ||
              item?.code ||
              item?.lineType ||
              t("Line Item {n}", { n: index + 1 })
            ).trim();
            const detailBits = [
              item?.quantity ? `${t("Qty")} ${item.quantity}` : "",
              item?.status ? String(item.status) : "",
              item?.referenceNumber ? `${t("Ref")} ${item.referenceNumber}` : "",
              item?.adjustmentType ? String(item.adjustmentType) : ""
            ].filter(Boolean);
            const amount = readInvoiceLineItemAmount(item);
            return `
              <article class="row-item compact-rate">
                <div>
                  <strong>${escapeHtml(label)}</strong>
                  <small>${escapeHtml(detailBits.join(" · ") || t("Invoice line item"))}</small>
                </div>
                <div class="price-block">
                  <strong>${money.format(amount)}</strong>
                </div>
              </article>
            `;
          }
        )
        .join("")}
    </div>
  `;
}

function extractMothershipInvoiceLineItems(payload) {
  const source = unwrapMothershipInvoiceDetail(payload);
  const candidates = [
    source?.lineItems,
    source?.line_items,
    source?.items,
    source?.charges,
    source?.adjustments,
    source?.data?.lineItems,
    source?.data?.items,
    source?.data?.charges,
    source?.invoice?.lineItems,
    source?.invoice?.items
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function readInvoiceLineItemAmount(item) {
  return normalizeMothershipCurrencyAmount(readNestedNumber(item, [
    ["amount"],
    ["amountDue"],
    ["amount_due"],
    ["chargeAmount"],
    ["charge_amount"],
    ["lineTotal"],
    ["line_total"],
    ["total"],
    ["totalAmount"],
    ["total_amount"],
    ["value"],
    ["price"],
    ["rate"],
    ["extendedAmount"],
    ["extended_amount"]
  ]));
}

function unwrapMothershipInvoiceDetail(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  return Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
}

function readNestedNumber(source, paths) {
  for (const path of paths) {
    let current = source;
    for (const key of path) {
      current = current?.[key];
    }
    if (current !== undefined && current !== null && current !== "") {
      const number = parseMoneyValue(current);
      if (Number.isFinite(number)) {
        return number;
      }
    }
  }
  return 0;
}

function readNestedString(source, paths) {
  for (const path of paths) {
    let current = source;
    for (const key of path) {
      current = current?.[key];
    }
    if (current !== undefined && current !== null && current !== "") {
      const text = String(current).trim();
      if (text) {
        return text;
      }
    }
  }
  return "";
}

function resolveInvoiceShipment(invoice) {
  const target = resolveInvoiceDocumentTarget(invoice);
  if (!target.localShipment) {
    return null;
  }
  return target.localShipment;
}

function resolveInvoiceDocumentTarget(invoice) {
  const candidates = extractInvoiceShipmentCandidates(invoice);
  const localShipment = candidates.length
    ? state.shipments.find((shipment) =>
        candidates.some((candidate) =>
          String(shipment.id || "").trim() === candidate ||
          String(shipment.carrierShipmentId || "").trim() === candidate ||
          String(shipment.carrierEntityId || "").trim() === candidate ||
          String(shipment.confirmationNumber || "").trim() === candidate ||
          String(shipment.referenceNumber || "").trim() === candidate
        )
      ) || null
    : null;

  const carrierEntityId =
    readNestedString(invoice?.rawCarrierResponse || invoice, [["entityID"]]) ||
    readNestedString(invoice?.rawCarrierResponse || invoice, [["entityId"]]) ||
    readNestedString(invoice?.rawCarrierResponse || invoice, [["entity_id"]]) ||
    readNestedString(invoice?.rawCarrierResponse || invoice, [["shipment", "entityID"]]) ||
    readNestedString(invoice?.rawCarrierResponse || invoice, [["shipment", "entityId"]]) ||
    readNestedString(invoice?.rawCarrierResponse || invoice, [["shipment", "entity_id"]]) ||
    invoice?.carrierEntityId ||
    (localShipment ? localShipment.carrierEntityId : "") ||
    "";

  const displayLabel = localShipment
    ? `${t("Shipment")} ${localShipment.confirmationNumber || localShipment.id}`
    : carrierEntityId
      ? `${t("Shipment")} ${carrierEntityId}`
      : "";

  return {
    localShipment,
    entityId: carrierEntityId || "",
    carrierShipmentId: invoice?.carrierShipmentId || (localShipment ? localShipment.carrierShipmentId : "") || "",
    displayLabel
  };
}

function extractInvoiceShipmentCandidates(invoice) {
  const source = invoice?.rawCarrierResponse || invoice || null;
  return [
    readNestedString(invoice, [["carrierEntityId"]]),
    readNestedString(source, [["carrierEntityId"]]),
    readNestedString(source, [["carrier_entity_id"]]),
    readNestedString(source, [["entityID"]]),
    readNestedString(source, [["entityId"]]),
    readNestedString(source, [["entity_id"]]),
    readNestedString(source, [["shipment", "entityID"]]),
    readNestedString(source, [["shipment", "entityId"]]),
    readNestedString(source, [["shipment", "entity_id"]]),
    readNestedString(invoice, [["shipmentId"]]),
    readNestedString(source, [["shipmentId"]]),
    readNestedString(source, [["shipment_id"]]),
    readNestedString(source, [["carrierShipmentId"]]),
    readNestedString(source, [["carrier_shipment_id"]]),
    readNestedString(source, [["confirmationNumber"]]),
    readNestedString(source, [["confirmation_number"]]),
    readNestedString(source, [["shipment", "id"]]),
    readNestedString(source, [["shipment", "shipmentId"]]),
    readNestedString(source, [["shipment", "carrierShipmentId"]]),
    readNestedString(source, [["shipment", "confirmationNumber"]]),
    readNestedString(source, [["referenceNumber"]]),
    readNestedString(source, [["shipment", "referenceNumber"]])
  ].filter(Boolean);
}

function invoiceCarrierDocumentActions(entityId) {
  const value = String(entityId || "").trim();
  if (!value) {
    const title = t("This invoice is not linked to a Mothership entity ID.");
    return `
      <button class="secondary-action" type="button" disabled title="${escapeHtml(title)}">${t("View BOL")}</button>
      <button class="secondary-action" type="button" disabled title="${escapeHtml(title)}">${t("View POD")}</button>
    `;
  }

  return `
    <button class="secondary-action" type="button" data-view-bol-carrier-entity="${escapeHtml(value)}">${t("View BOL")}</button>
    <button class="secondary-action" type="button" data-view-pod-carrier-entity="${escapeHtml(value)}">${t("View POD")}</button>
  `;
}

function normalizeMothershipCurrencyAmount(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (Number.isInteger(value) && Math.abs(value) >= 100) {
    return value / 100;
  }

  return value;
}

function parseMoneyValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {
      return NaN;
    }

    const cleaned = text
      .replace(/\$/g, "")
      .replace(/,/g, "")
      .replace(/\s+/g, " ")
      .replace(/\(([^)]+)\)/g, "-$1");
    const direct = Number(cleaned);
    if (Number.isFinite(direct)) {
      return direct;
    }

    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      return Number.isFinite(parsed) ? parsed : NaN;
    }
  }

  if (value && typeof value === "object") {
    const nestedCandidates = [
      value.value,
      value.amount,
      value.total,
      value.totalAmount,
      value.total_amount,
      value.balanceDue,
      value.balance_due,
      value.invoiceTotal,
      value.invoice_total
    ];
    for (const candidate of nestedCandidates) {
      const parsed = parseMoneyValue(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return NaN;
}

function isImportedInvoiceReference(invoice) {
  if (invoice?.source !== "mothership") {
    return false;
  }

  const fallbackInvoiceNumber = String(invoice.invoiceNumber || "").startsWith("MS-");
  const fallbackCustomer = !invoice.customerName || invoice.customerName === "Imported from Mothership";
  return fallbackInvoiceNumber && !invoice.referenceNumber && Number(invoice.amount || 0) === 0 && !invoice.shipmentId && fallbackCustomer;
}

function carrierDisplayName(provider, carrierMode = "", customerView = false) {
  const normalized = String(provider || "").trim().toLowerCase();
  const mode = String(carrierMode || "").trim().toLowerCase();
  const knownNames = {
    xpo: "XPO Logistics",
    xpol: "XPO Logistics",
    saia: "SAIA Freight",
    olddominion: "Old Dominion Freight Line",
    odfl: "Old Dominion Freight Line",
    abf: "ABF Freight",
    abfs: "ABF Freight",
    roadrunner: "Roadrunner Freight",
    rdfs: "Roadrunner Freight",
    frontline: "Frontline Freight",
    fcsy: "Frontline Freight",
    tforce: "TForce Freight",
    tfin: "TForce Freight",
    stg: "STG Logistics",
    stglogistics: "STG Logistics",
    fedex: "FedEx Freight",
    fedexfreight: "FedEx Freight",
    fedexltl: "FedEx Freight",
    fxf: "FedEx Freight"
  };
  if (knownNames[normalized]) {
    return knownNames[normalized];
  }
  if (normalized.includes("speedship") || mode === "speedshipltl") {
    return "SpeedShip";
  }
  if (normalized.includes("priority1") || mode === "priority1ltl") {
    return "Priority1";
  }
  if (normalized.includes("fedex") || mode === "fedexfreight") {
    return "FedEx Freight";
  }
  if (normalized.includes("mothership")) {
    return customerView ? t("Self-owned Truck") : t("Mothership");
  }
  if (!provider) {
    return t("Carrier");
  }
  return String(provider)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function carrierModeListLabel(modes, customerView = false) {
  const normalizedModes = Array.isArray(modes) ? modes.filter(Boolean) : normalizeAllowedCarrierModes(modes);
  if (normalizedModes.length === 0) {
    return "";
  }

  return normalizeAllowedCarrierModes(normalizedModes)
    .map((mode) => carrierModeSummaryLabel(mode, customerView))
    .join(", ");
}

function carrierModeSummaryLabel(mode, customerView = false) {
  const normalized = String(mode || "").trim().toLowerCase();
  if (customerView) {
    if (normalized === "mothershipsandbox") {
      return "M";
    }
    if (normalized === "speedshipltl") {
      return "SS";
    }
    if (normalized === "priority1ltl") {
      return "P";
    }
    if (normalized === "fedexfreight") {
      return "FX";
    }
    if (normalized === "demo") {
      return "D";
    }
  }

  switch (normalized) {
    case "mothershipsandbox":
      return "Mothership sandbox";
    case "speedshipltl":
      return "SpeedShip LTL";
    case "priority1ltl":
      return "Priority1 LTL";
    case "fedexfreight":
      return "FedEx Freight";
    case "demo":
      return "Demo rates";
    default:
      return carrierDisplayName(mode);
  }
}

function quoteCarrierModesList(quote) {
  const directModes = Array.isArray(quote?.carrierModes)
    ? quote.carrierModes
        .map((mode) => String(mode || "").trim())
        .filter((mode) => ["mothershipSandbox", "speedshipLtl", "priority1Ltl", "fedexFreight", "demo"].includes(mode))
    : [];
  if (directModes.length > 0) {
    return directModes;
  }

  const legacyMode = String(quote?.carrierMode || "").trim();
  if (!legacyMode || legacyMode === "multiCarrier" || !["mothershipSandbox", "speedshipLtl", "priority1Ltl", "fedexFreight", "demo"].includes(legacyMode)) {
    return [];
  }

  return [legacyMode];
}

function sortedQuoteRates(quote) {
  const rates = Array.isArray(quote?.rates) ? [...quote.rates] : [];
  return rates.sort((left, right) => {
    const leftPrice = Number(left?.sellPrice ?? left?.carrierCost ?? Number.POSITIVE_INFINITY);
    const rightPrice = Number(right?.sellPrice ?? right?.carrierCost ?? Number.POSITIVE_INFINITY);
    if (leftPrice !== rightPrice) {
      return leftPrice - rightPrice;
    }
    const leftLabel = carrierNameLabel(left, quote, isCustomerUser());
    const rightLabel = carrierNameLabel(right, quote, isCustomerUser());
    return leftLabel.localeCompare(rightLabel);
  });
}

function normalizeCarrierModeValue(value) {
  const key = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  const aliases = {
    mothership: "mothershipSandbox",
    mothershipsandbox: "mothershipSandbox",
    speedship: "speedshipLtl",
    speedshipltl: "speedshipLtl",
    priority1: "priority1Ltl",
    priority1ltl: "priority1Ltl",
    fedex: "fedexFreight",
    fedexfreight: "fedexFreight",
    fedexltl: "fedexFreight",
    demo: "demo"
  };
  return aliases[key] || String(value || "").trim();
}

function normalizeAllowedCarrierModes(values, fallback = ["mothershipSandbox"]) {
  const list = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(/[,\s]+/).filter(Boolean)
      : [];
  const normalized = [];

  for (const entry of list) {
    const mode = normalizeCarrierModeValue(entry);
    if (!mode) {
      continue;
    }
    if (!["mothershipSandbox", "speedshipLtl", "priority1Ltl", "fedexFreight", "demo"].includes(mode)) {
      continue;
    }
    if (!normalized.includes(mode)) {
      normalized.push(mode);
    }
  }

  return normalized.length > 0 ? normalized : fallback;
}

function carrierBadgeLabel(provider, carrierMode = "", customerView = false) {
  if (!customerView) {
    return carrierDisplayName(provider, carrierMode, false);
  }

  const normalized = String(provider || "").trim().toLowerCase();
  const mode = String(carrierMode || "").trim().toLowerCase();
  if (normalized.includes("speedship") || mode === "speedshipltl") {
    return "SS";
  }
  if (normalized.includes("priority1") || mode === "priority1ltl") {
    return "P";
  }
  if (normalized.includes("fedex") || mode === "fedexfreight") {
    return "FX";
  }
  if (normalized.includes("mothership") || mode === "mothershipsandbox") {
    return "M";
  }
  if (!provider) {
    return "C";
  }

  return String(provider)
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function carrierNameLabel(rate, quote, customerView = false) {
  const explicitName = String(rate?.carrierName || "").trim();
  if (explicitName) {
    if (customerView && explicitName.toLowerCase().includes("mothership")) {
      return t("Self-owned Truck");
    }
    return explicitName;
  }

  return carrierDisplayName(
    rate?.provider || quote?.carrierMode || "",
    rate?.carrierSource || quote?.carrierMode || "",
    customerView
  );
}

function rateHeading(rate, quote, customerView = false) {
  return `${carrierNameLabel(rate, quote, customerView)} - ${formatRateService(rate?.service)}`;
}

function formatRateService(service) {
  const text = String(service || "").trim();
  if (!text) {
    return "Service";
  }
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function decorateRequiredQuoteLabels() {
  document.querySelectorAll("#quoteForm label").forEach((label) => {
    if (label.querySelector(".field-label")) {
      return;
    }

    const control = label.querySelector("input, select, textarea");
    if (!control || !control.required) {
      return;
    }

    const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!textNode) {
      return;
    }

    const fieldLabel = document.createElement("span");
    fieldLabel.className = "field-label";
    fieldLabel.textContent = textNode.textContent.trim();

    const requiredMark = document.createElement("span");
    requiredMark.className = "required-mark";
    requiredMark.setAttribute("aria-hidden", "true");
    requiredMark.textContent = "*";

    fieldLabel.appendChild(requiredMark);
    textNode.parentNode.insertBefore(fieldLabel, textNode);
    textNode.remove();
  });
}

function validateQuoteForm(form) {
  const error = document.getElementById("quoteFormError");
  clearQuoteFormErrors(form);

  const controls = Array.from(form.querySelectorAll("input, select, textarea")).filter((control) => !control.disabled);
  const invalidControls = [];

  controls.forEach((control) => {
    const value = String(control.value || "").trim();

    if (control.name === "pickupPhone" || control.name === "deliveryPhone") {
      const normalized = normalizePhoneNumber(value);
      if (value && normalized.length !== 10) {
        control.setCustomValidity("Phone numbers must be 10 digits.");
      } else {
        control.setCustomValidity("");
      }
    } else {
      control.setCustomValidity("");
    }

    if (!control.checkValidity()) {
      invalidControls.push(control);
    }
  });

  if (invalidControls.length === 0) {
    const pickupTimeValidation = validateQuotePickupTimes(form);
    if (!pickupTimeValidation.valid) {
      const control = form.elements[pickupTimeValidation.field];
      if (control) {
        invalidControls.push(control);
      }
      showPickupTimeValidationError(form, pickupTimeValidation);
    }
  }

  if (invalidControls.length === 0) {
    if (error) {
      error.textContent = "";
    }
    return true;
  }

  invalidControls.forEach((control) => {
    control.classList.add("field-invalid");
    control.setAttribute("aria-invalid", "true");
    const label = control.closest("label");
    if (label) {
      label.classList.add("field-invalid");
    }
  });

  if (error) {
      const phoneInvalid = invalidControls.some((control) => control.name === "pickupPhone" || control.name === "deliveryPhone");
      error.textContent = error.textContent || (phoneInvalid
        ? "Phone numbers must be 10 digits and the highlighted fields must be completed before getting rates."
        : "Please fill in the highlighted required fields before getting rates.");
    }

  invalidControls[0].focus();
  showToast(error?.textContent || t("Please fill in the required fields."), true);
  return false;
}

function validateQuotePickupTimes(form) {
  return validatePickupReadyWindow({
    openTime: form.elements.pickupOpen?.value,
    readyTime: form.elements.pickupTime?.value,
    closeTime: form.elements.pickupClose?.value
  });
}

function pickupTimeValidationMessage(code) {
  switch (code) {
    case pickupTimeErrorCodes.invalidHours:
      return t("Pickup open time must be earlier than pickup close time.");
    case pickupTimeErrorCodes.readyBeforeOpen:
      return t("Pickup ready time must not be earlier than pickup opening time.");
    case pickupTimeErrorCodes.readyAfterClose:
      return t("Pickup ready time must be earlier than pickup close time.");
    default:
      return t("Enter valid pickup times.");
  }
}

function showPickupTimeValidationError(form, validation) {
  const control = form.elements[validation.field];
  const message = pickupTimeValidationMessage(validation.code);
  if (control) {
    control.setCustomValidity(message);
    control.classList.add("field-invalid");
    control.setAttribute("aria-invalid", "true");
    control.closest("label")?.classList.add("field-invalid");
  }

  const target = form.querySelector(`[data-field-error-for='${validation.field}']`);
  if (target) {
    const action = validation.code === pickupTimeErrorCodes.readyBeforeOpen
      ? ` <button class="inline-link-button" type="button" data-use-pickup-opening-time>${t("Use pickup opening time")}</button>`
      : "";
    target.innerHTML = `${escapeHtml(message)}${action}`;
  }

  const error = document.getElementById("quoteFormError");
  if (error) {
    error.textContent = message;
  }
}

function clearQuoteFormErrors(form) {
  form.querySelectorAll(".field-invalid").forEach((element) => {
    element.classList.remove("field-invalid");
  });
  form.querySelectorAll("[data-field-error-for]").forEach((element) => {
    element.textContent = "";
  });
  form.querySelectorAll("[aria-invalid='true']").forEach((element) => {
    element.removeAttribute("aria-invalid");
  });
  form.querySelectorAll("input, select, textarea").forEach((control) => {
    if (typeof control.setCustomValidity === "function") {
      control.setCustomValidity("");
    }
  });

  const error = document.getElementById("quoteFormError");
  if (error) {
    error.textContent = "";
  }
}

function syncCarrierControls() {
  const hint = document.getElementById("carrierModeHint");
  const quoteCustomerSelect = document.getElementById("quoteCustomerSelect");
  if (!hint || !quoteCustomerSelect) {
    return;
  }

  const customer = state.customers.find((item) => item.id === quoteCustomerSelect.value) || null;
  const allowedModes = normalizeAllowedCarrierModes(customer?.allowedCarrierModes || []);
  if (!customer) {
    hint.textContent = t("Select a customer to see the carrier modes assigned by admin.");
    return;
  }

  const label = carrierModeListLabel(allowedModes, isCustomerUser());
  hint.textContent = isCustomerUser()
    ? t("Your quote uses the carrier modes assigned to your account: {label}.", { label })
    : t("Assigned carrier modes for {name}: {label}.", { name: customer.companyName, label });
}

function syncTariffCarrierModes(customerId) {
  const customer = state.customers.find((item) => item.id === customerId) || null;
  const selectedModes = normalizeAllowedCarrierModes(customer?.allowedCarrierModes || []);
  document.querySelectorAll("#tariffForm input[name='allowedCarrierModes']").forEach((checkbox) => {
    checkbox.checked = selectedModes.includes(checkbox.value);
  });
}

function syncTariffBookingPermission(customerId) {
  const customer = state.customers.find((item) => item.id === customerId) || null;
  const allowedModeCheckboxes = Array.from(document.querySelectorAll("#tariffForm input[name='allowedCarrierModes']"));
  const currentAllowedModes = allowedModeCheckboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
  const selectedModes = customer ? customerAllowedBookingModes(customer) : currentAllowedModes;
  document.querySelectorAll("#tariffForm input[name='allowedBookingCarrierModes']").forEach((checkbox) => {
    const carrierAllowed = currentAllowedModes.includes(checkbox.value);
    checkbox.disabled = !carrierAllowed;
    checkbox.checked = carrierAllowed && selectedModes.includes(checkbox.value);
  });
}

function renderCustomerOptions() {
  const quoteSelect = document.getElementById("quoteCustomerSelect");
  const previousQuoteCustomerId = quoteSelect?.value || "";
  const options = state.customers
    .map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.companyName)}</option>`)
    .join("");

  const tariffSelect = document.getElementById("tariffCustomerSelect");
  if (tariffSelect) {
    tariffSelect.innerHTML = options;
    syncTariffCarrierModes(tariffSelect.value || state.customers[0]?.id || "");
    syncTariffBookingPermission(tariffSelect.value || state.customers[0]?.id || "");
  }
  if (quoteSelect) {
    quoteSelect.innerHTML = options;
    if (isCustomerUser()) {
      quoteSelect.value = state.user?.customerId || state.customers[0]?.id || "";
    } else if (previousQuoteCustomerId && state.customers.some((customer) => customer.id === previousQuoteCustomerId)) {
      quoteSelect.value = previousQuoteCustomerId;
    }
    if (quoteSelect.value && !state.pendingQuoteReentry && isPickupAutofillEmpty()) {
      autofillPickupFromCustomer(quoteSelect.value, false);
    }
  }
  syncCarrierControls();
  updateFreightClassSuggestion();
}

function renderCustomers() {
  const list = document.getElementById("customerList");

  if (state.customers.length === 0) {
    list.innerHTML = `<div class="empty-state">${t("No customers yet.")}</div>`;
    return;
  }

  list.innerHTML = state.customers
    .map((customer) => {
      const tariff = state.tariffs.find((rule) => rule.customerId === customer.id);
      const allowedModes = Array.isArray(customer.allowedCarrierModes) ? customer.allowedCarrierModes : [];
      const bookingModes = customerAllowedBookingModes(customer);
      return `
        <article class="row-item" data-customer-id="${escapeHtml(customer.id)}">
          <div>
            <strong>${escapeHtml(customer.companyName)}</strong>
            <small>${escapeHtml(customer.billingEmail || t("No billing email"))} · ${escapeHtml(customer.paymentTerms)}</small>
            <div class="meta-line">
              ${(customer.companyStreet || customer.companyCity || customer.companyState || customer.companyZip)
                ? `<span class="pill">${escapeHtml([customer.companyStreet, customer.companyCity, customer.companyState, customer.companyZip].filter(Boolean).join(", "))}</span>`
                : ""}
              ${allowedModes.length > 0
                ? `<span class="pill">${escapeHtml(carrierModeListLabel(allowedModes, false))}</span>`
                : ""}
              <span class="pill">${bookingModes.length > 0 ? `${t("Booking")}: ${escapeHtml(carrierModeListLabel(bookingModes, false))}` : t("Booking disabled")}</span>
              <span class="pill">${escapeHtml(tariff?.ruleType || t("no tariff"))}</span>
              <span class="pill">${Number(tariff?.markupPercentage || 0)}% ${t("markup")}</span>
              <span class="pill">${money.format(Number(tariff?.fixedAmount || 0))} ${t("fixed")}</span>
            </div>
          </div>
          <span class="pill">${escapeHtml(customer.status)}</span>
        </article>
      `;
    })
    .join("");

  decorateCustomerRows(list);
}

function decorateCustomerRows(list) {
  const isStaff = ["admin", "operations"].includes(state.user?.role);
  if (!isStaff) {
    return;
  }

  list.querySelectorAll("[data-customer-id]").forEach((row) => {
    if (row.querySelector(".customer-row-actions")) {
      return;
    }

    const customerId = row.dataset.customerId;
    const customer = state.customers.find((item) => item.id === customerId);
    if (!customer) {
      return;
    }

    const statusAction = customer.status === "disabled" ? "Enable" : "Disable";
    const actions = document.createElement("div");
    actions.className = "customer-row-actions";
    actions.innerHTML = `
      <button class="secondary-action" type="button" data-edit-customer="${escapeHtml(customer.id)}">Edit</button>
      <button class="secondary-action" type="button" data-toggle-customer-status="${escapeHtml(customer.id)}">${statusAction}</button>
      <button class="danger-action" type="button" data-delete-customer="${escapeHtml(customer.id)}">Delete</button>
    `;
    row.appendChild(actions);
  });

  list.querySelectorAll("[data-edit-customer]").forEach((button) => {
    button.addEventListener("click", () => openCustomerEditor(button.dataset.editCustomer));
  });
  list.querySelectorAll("[data-toggle-customer-status]").forEach((button) => {
    button.addEventListener("click", () => toggleCustomerStatus(button.dataset.toggleCustomerStatus));
  });
  list.querySelectorAll("[data-delete-customer]").forEach((button) => {
    button.addEventListener("click", () => deleteCustomerAccount(button.dataset.deleteCustomer));
  });
}

function renderDashboard() {
  document.getElementById("customerCount").textContent = state.customers.length;
  document.getElementById("quoteCount").textContent = state.quotes.length;
  document.getElementById("shipmentCount").textContent = state.shipments.length;
  document.getElementById("invoiceCount").textContent = state.invoices.filter((invoice) => invoice.status === "draft").length;

  const recent = document.getElementById("recentShipments");
  recent.innerHTML = state.shipments.length
    ? state.shipments.slice(0, 5).map(shipmentRow).join("")
    : `<div class="empty-state">${t("No shipments booked yet.")}</div>`;

  renderDashboardSupportPanel();
}

function renderQuoteResults(quote) {
  const list = document.getElementById("quoteResults");
  if (!list) {
    return;
  }
  const totalRates = Array.isArray(quote.rates) ? quote.rates.length : 0;
  const visibleCount = Math.min(state.quoteResultsLimit || 12, totalRates || 0);
  list.classList.remove("empty-state");
  list.classList.toggle("compare-grid", visibleCount > 1);
  const customerView = isCustomerUser();
  const priceLabel = customerPriceLabel();
  const quoteCarrierModes = quoteCarrierModesList(quote);
  const carrierLabel = quoteCarrierModes.length > 1
    ? t("Carriers")
    : carrierModeSummaryLabel(quoteCarrierModes[0], customerView);
  const sortedRates = sortedQuoteRates(quote);
  const carrierStatus = quoteCarrierStatusHtml(quote);
  if (!Array.isArray(sortedRates) || sortedRates.length === 0) {
    const notice = quote.carrierMessage || t("Carrier returned no rates for this lane.");
    list.innerHTML = `
      ${carrierStatus}
      <div class="quote-status notice-state success-state">
        <strong>${escapeHtml(quoteCarrierModes.length > 1 ? t("Carrier request completed") : `${carrierLabel} ${t("connection succeeded")}`)}</strong>
        <p>${escapeHtml(notice)}</p>
      </div>
    `;
    return;
  }
  const visibleRates = sortedRates.slice(0, visibleCount || sortedRates.length);
  const canLoadMore = visibleRates.length < sortedRates.length;
  list.innerHTML = `
    ${carrierStatus}
    ${visibleRates
    .map((rate) => {
      const rateBookingAllowed = !customerView || customerBookingAllowed(quote.customerId, rate.carrierSource || quote.carrierMode);
      return `
      <article class="rate-item quote-rate-card">
        <div class="rate-main">
          <div class="rate-title-row">
            <strong>${escapeHtml(carrierNameLabel(rate, quote, customerView))}</strong>
            <span class="service-badge">${escapeHtml(formatRateService(rate?.service))}</span>
            <span class="carrier-badge">${escapeHtml(carrierBadgeLabel(rate.provider, rate.carrierSource || quote.carrierMode, customerView))}</span>
          </div>
          <div class="rate-meta-row">
            ${hasDisplayValue(rate.transitDays) ? `<span class="pill">${t("Transit")} ${escapeHtml(formatTransitDays(rate.transitDays))}</span>` : ""}
            ${hasDisplayValue(rate.estimatedDeliveryDate) ? `<span class="pill">ETA ${escapeHtml(formatDate(rate.estimatedDeliveryDate))}</span>` : ""}
            ${customerView ? "" : `<span class="pill">${t("Markup")} ${money.format(rate.markup)}</span>`}
          </div>
          ${Array.isArray(rate.warnings) && rate.warnings.length > 0 ? `
            <div class="rate-warning-row">
              ${rate.warnings.map((warning) => `<span class="pill warning-pill">${escapeHtml(warning)}</span>`).join("")}
            </div>
          ` : ""}
          ${mothershipPurchaseStatusHtml(quote, rate)}
        </div>
        <div class="rate-aside">
          <small>${escapeHtml(priceLabel)}</small>
          <strong>${money.format(rate.sellPrice)}</strong>
          ${rateBookingAllowed
            ? `<button class="primary-action rate-book-action" type="button" data-book-rate="${escapeHtml(rate.id)}">${t("Book Shipment")}</button>`
            : `<small class="helper-text booking-disabled-note">${t("Booking disabled for this carrier.")}</small>`}
        </div>
      </article>
    `;
    })
    .join("")}
    ${canLoadMore ? `
      <div class="rate-list-footer">
        <button class="secondary-action" type="button" data-load-more-rates>${t("Load more results")}</button>
        <span class="helper-text">${t("Showing {visible} of {total} results", { visible: visibleRates.length, total: sortedRates.length })}</span>
      </div>
    ` : ""}
  `;

  list.querySelectorAll("[data-book-rate]").forEach((button) => {
    button.addEventListener("click", () => openBookingConfirmation(quote.id, button.dataset.bookRate));
  });
}

function renderQuoteResultsLoading() {
  const list = document.getElementById("quoteResults");
  if (!list) {
    return;
  }
  list.classList.remove("compare-grid");
  list.classList.remove("empty-state");
  list.innerHTML = `
    <div class="quote-status loading-state">
      <strong>${t("Rate results are loading")}</strong>
      <p>${t("Please wait while we contact the carrier platforms.")}</p>
    </div>
  `;
}

function loadMoreQuoteRates() {
  const quote = state.currentQuote;
  if (!quote || !Array.isArray(quote.rates) || quote.rates.length === 0) {
    return;
  }
  state.quoteResultsLimit = Math.min((state.quoteResultsLimit || 12) + 12, quote.rates.length);
  renderQuoteResults(quote);
}

async function finalizeBooking(quoteId, rateId) {
  const quote = state.currentQuote || state.quotes.find((item) => item.id === quoteId);
  const rate = quote && Array.isArray(quote.rates) ? quote.rates.find((item) => item.id === rateId) : null;
  if (isCustomerUser() && quote && rate && !customerBookingAllowed(quote.customerId, rate.carrierSource || quote.carrierMode)) {
    showToast(t("Shipment booking is disabled for this carrier."), true);
    return;
  }
  try {
    const response = await api("/api/shipments", {
      method: "POST",
      body: {
        quoteId,
        rateId,
        bookWithCarrier: Boolean(rate?.carrierSource === "mothershipSandbox")
      }
    });

    showToast(t("Booked {confirmationNumber}.", { confirmationNumber: response.shipment.confirmationNumber }));
    setView("shipments");
    await refreshAll();
  } catch (error) {
    showToast(error.message || t("Could not book shipment."), true);
  }
}

function renderShipments() {
  const list = document.getElementById("shipmentList");
  list.innerHTML = state.shipments.length
    ? state.shipments.map(shipmentRow).join("")
    : `<div class="empty-state">${t("No shipments yet.")}</div>`;
}

function renderInvoices() {
  const list = document.getElementById("invoiceList");
  if (!list) {
    return;
  }

  const mothershipInvoices = state.invoices.filter((invoice) => invoice?.source === "mothership");
  const otherInvoices = state.invoices.filter((invoice) => invoice?.source !== "mothership");
  const activeTab = resolveInvoiceTab(mothershipInvoices, otherInvoices);
  const visibleInvoices = activeTab === "mothership" ? mothershipInvoices : otherInvoices;
  const hiddenInvoices = activeTab === "mothership" ? otherInvoices : mothershipInvoices;
  const activeLabel = activeTab === "mothership" ? t("Imported from Mothership") : t("Other invoices");

  list.innerHTML = `
    <div class="invoice-tabs-shell">
      <div class="invoice-tabs" role="tablist" aria-label="${t("Invoice groups")}" data-i18n-aria-label="Invoice groups">
        <button class="invoice-tab ${activeTab === "mothership" ? "active" : ""}" type="button" data-invoice-tab="mothership" role="tab" aria-selected="${activeTab === "mothership"}">
          ${t("Imported from Mothership")} <span class="tab-count">${mothershipInvoices.length}</span>
        </button>
        <button class="invoice-tab ${activeTab === "local" ? "active" : ""}" type="button" data-invoice-tab="local" role="tab" aria-selected="${activeTab === "local"}">
          ${t("Other invoices")} <span class="tab-count">${otherInvoices.length}</span>
        </button>
      </div>
      <div class="invoice-tab-panel">
        ${invoiceGroupHtml(
          activeLabel,
          activeTab === "mothership"
            ? t("Invoices hydrated from the carrier invoice sync.")
            : t("Invoices created locally from booked shipments."),
          visibleInvoices,
          activeTab === "mothership" ? t("No Mothership invoices imported yet.") : t("No local invoices yet.")
        )}
        ${hiddenInvoices.length ? `<div class="invoice-tab-hint">${escapeHtml(hiddenInvoices.length)} ${t("invoice hidden in the other tab.")}</div>` : ""}
      </div>
    </div>
  `;
}

function invoiceGroupHtml(title, description, invoices, emptyLabel) {
  return `
    <section class="invoice-group">
      <div class="invoice-group-header">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p class="helper-text">${escapeHtml(description)}</p>
        </div>
        <span class="pill">${escapeHtml(String(invoices.length))}</span>
      </div>
      <div class="invoice-group-body">
        ${invoices.length ? invoices.map((invoice) => invoiceRow(invoice)).join("") : `<div class="empty-state">${escapeHtml(emptyLabel)}</div>`}
      </div>
    </section>
  `;
}

function resolveInvoiceTab(mothershipInvoices, otherInvoices) {
  const hasMothership = mothershipInvoices.length > 0;
  const hasOther = otherInvoices.length > 0;

  if (state.invoiceTab === "mothership" && hasMothership) {
    return "mothership";
  }

  if (state.invoiceTab === "local" && hasOther) {
    return "local";
  }

  if (hasMothership) {
    state.invoiceTab = "mothership";
    return "mothership";
  }

  if (hasOther) {
    state.invoiceTab = "local";
    return "local";
  }

  state.invoiceTab = "mothership";
  return "mothership";
}

function setInvoiceTab(tab) {
  const normalized = String(tab || "").trim().toLowerCase() === "local" ? "local" : "mothership";
  if (state.invoiceTab === normalized) {
    return;
  }

  state.invoiceTab = normalized;
  renderInvoices();
}

function quotePayload(form) {
  const customerId = form.get("customerId");
  const customer = state.customers.find((item) => item.id === customerId) || null;
  const pickupAccessorials = form.getAll("pickupAccessorials");
  const deliveryAccessorials = normalizeDeliveryAccessorials(form.getAll("deliveryAccessorials"));
  const pickupName = String(form.get("pickupName") || "").trim() || customer?.companyName || "";
  const pickupStreet = String(form.get("pickupStreet") || "").trim() || customer?.companyStreet || "";
  const pickupCity = String(form.get("pickupCity") || "").trim() || customer?.companyCity || "";
  const pickupState = String(form.get("pickupState") || "").trim() || customer?.companyState || "";
  const pickupZip = String(form.get("pickupZip") || "").trim() || customer?.companyZip || "";
  const pickupPhone = normalizePhoneNumber(String(form.get("pickupPhone") || "").trim() || customer?.companyPhone || "");
  const pickupOpen = String(form.get("pickupOpen") || "").trim() || customer?.companyOpenTime || "";
  const pickupClose = String(form.get("pickupClose") || "").trim() || customer?.companyCloseTime || "";
  const deliveryPhone = normalizePhoneNumber(String(form.get("deliveryPhone") || "").trim());
  return {
    customerId,
    referenceNumber: form.get("referenceNumber"),
    pickupReadyDate: {
      date: form.get("pickupDate"),
      time: form.get("pickupTime")
    },
    pickup: {
      name: pickupName,
      address: {
        street: pickupStreet,
        city: pickupCity,
        state: pickupState,
        zip: pickupZip
      },
      phoneNumber: pickupPhone,
      emails: form.get("pickupEmail") ? [form.get("pickupEmail")] : [],
      openTime: pickupOpen,
      closeTime: pickupClose,
      accessorials: pickupAccessorials
    },
    delivery: {
      name: form.get("deliveryName"),
      address: {
        street: form.get("deliveryStreet"),
        city: form.get("deliveryCity"),
        state: form.get("deliveryState"),
        zip: form.get("deliveryZip")
      },
      phoneNumber: deliveryPhone,
      emails: form.get("deliveryEmail") ? [form.get("deliveryEmail")] : [],
      openTime: form.get("deliveryOpen"),
      closeTime: form.get("deliveryClose"),
      accessorials: deliveryAccessorials
    },
    freight: freightRows().map((row) => {
      const data = freightRowData(row);
      return {
        quantity: data.quantity,
        type: data.type,
        pieces: data.pieces || 1,
        weight: data.weight,
        freightClass: data.freightClass,
        nmfc: data.nmfc,
        length: data.length,
        width: data.width,
        height: data.height,
        description: data.description,
        stackable: data.stackable,
        hazmat: data.hazmat,
        used: data.used,
        machinery: data.machinery
      };
    })
  };
}

function populateQuoteFormFromQuote(quote) {
  const form = document.getElementById("quoteForm");
  if (!form || !quote) {
    return;
  }

  const setValue = (name, value) => {
    const control = form.querySelector(`[name='${name}']`);
    if (control) {
      control.value = value ?? "";
    }
  };

  const setCheckboxGroup = (name, values) => {
    const selected = new Set((Array.isArray(values) ? values : []).filter(Boolean));
    form.querySelectorAll(`input[name='${name}']`).forEach((input) => {
      input.checked = selected.has(input.value);
    });
  };

  setValue("customerId", quote.customerId || "");
  setValue("referenceNumber", "");
  setValue("pickupDate", "");
  setValue("pickupTime", "");

  setValue("pickupName", quote.pickup?.name || "");
  setValue("pickupStreet", quote.pickup?.address?.street || "");
  setValue("pickupCity", quote.pickup?.address?.city || "");
  setValue("pickupState", quote.pickup?.address?.state || "");
  setValue("pickupZip", quote.pickup?.address?.zip || "");
  setValue("pickupPhone", quote.pickup?.phoneNumber || "");
  setValue("pickupEmail", Array.isArray(quote.pickup?.emails) ? quote.pickup.emails[0] || "" : "");
  setValue("pickupOpen", quote.pickup?.openTime || "");
  setValue("pickupClose", quote.pickup?.closeTime || "");

  setValue("deliveryName", quote.delivery?.name || "");
  setValue("deliveryStreet", quote.delivery?.address?.street || "");
  setValue("deliveryCity", quote.delivery?.address?.city || "");
  setValue("deliveryState", quote.delivery?.address?.state || "");
  setValue("deliveryZip", quote.delivery?.address?.zip || "");
  setValue("deliveryPhone", quote.delivery?.phoneNumber || "");
  setValue("deliveryEmail", Array.isArray(quote.delivery?.emails) ? quote.delivery.emails[0] || "" : "");
  setValue("deliveryOpen", quote.delivery?.openTime || "");
  setValue("deliveryClose", quote.delivery?.closeTime || "");

  const freightItems = Array.isArray(quote.freight) && quote.freight.length > 0 ? quote.freight : [{}];
  const freightContainer = document.getElementById("freightRows");
  if (freightContainer) {
    freightContainer.innerHTML = "";
    freightItems.forEach((item) => {
      const displayValues = convertFreightRowValues(
        {
          quantity: item.quantity ?? "",
          weight: item.weight ?? "",
          length: item.length ?? "",
          width: item.width ?? "",
          height: item.height ?? ""
        },
        "imperial",
        state.freightUnits
      );
      addFreightRow({
        quantity: displayValues.quantity ?? "",
        type: item.type || "",
        pieces: item.pieces ?? 1,
        weight: displayValues.weight ?? "",
        freightClass: item.freightClass || "",
        nmfc: item.nmfc || "",
        length: displayValues.length ?? "",
        width: displayValues.width ?? "",
        height: displayValues.height ?? "",
        description: item.description || "",
        stackable: item.stackable,
        hazmat: item.hazmat,
        used: item.used,
        machinery: item.machinery
      });
    });
  }

  setCheckboxGroup("pickupAccessorials", quote.pickup?.accessorials || []);
  setCheckboxGroup("deliveryAccessorials", quote.delivery?.accessorials || []);
  document.querySelectorAll(".accessorial-dropdown").forEach((details) => {
    if (details.dataset.accessorialGroup === "delivery") {
      enforceDeliveryAccessorialDependencies(details);
    }
    syncAccessorialDropdown(details);
  });

  syncCarrierControls();
  clearQuoteFormErrors(form);
  updateFreightClassSuggestion();
  triggerZipAutofillField("pickupZip", form);
  triggerZipAutofillField("deliveryZip", form);
}

function triggerZipAutofillField(name, root = document) {
  const input = root.querySelector(`[name='${name}']`);
  if (!input) {
    return;
  }
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function normalizeDeliveryAccessorials(accessorials) {
  const normalized = Array.from(new Set(accessorials.filter(Boolean)));
  if (normalized.includes("residential") && !normalized.includes("scheduledDelivery")) {
    normalized.push("scheduledDelivery");
  }
  return normalized;
}

function normalizePhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

function populateTimeSelects() {
  document.querySelectorAll("[data-time-select]").forEach((select) => {
    if (select.dataset.populated === "true") {
      return;
    }

    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = t("Select time");
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    for (let hour = 0; hour < 24; hour += 1) {
      const value = `${String(hour).padStart(2, "0")}00`;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = formatTimeHour(value);
      select.appendChild(option);
    }

    select.dataset.populated = "true";
  });
}

function wireAccessorialDropdowns() {
  document.querySelectorAll(".accessorial-dropdown").forEach((details) => {
    const update = () => {
      if (details.dataset.accessorialGroup === "delivery") {
        enforceDeliveryAccessorialDependencies(details);
      }
      syncAccessorialDropdown(details);
    };

    details.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
      checkbox.addEventListener("change", update);
    });

    update();
  });
}

function syncAccessorialDropdown(details) {
  const summary = details.querySelector(".accessorial-summary");
  if (!summary) {
    return;
  }

  const selectedLabels = Array.from(details.querySelectorAll("input[type='checkbox']:checked"))
    .map((checkbox) => checkbox.dataset.label || checkbox.value);

  if (selectedLabels.length === 0) {
    summary.textContent = t("Select accessorials");
    return;
  }

  if (selectedLabels.length <= 2) {
    summary.textContent = selectedLabels.join(", ");
    return;
  }

  summary.textContent = `${selectedLabels.slice(0, 2).join(", ")} +${selectedLabels.length - 2} more`;
}

function enforceDeliveryAccessorialDependencies(details) {
  const residential = details.querySelector("input[value='residential']");
  const scheduledDelivery = details.querySelector("input[value='scheduledDelivery']");
  if (!residential || !scheduledDelivery) {
    return;
  }

  if (residential.checked) {
    scheduledDelivery.checked = true;
  }
}

function setDefaultPickupDate() {
  return;
}

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3200);
}

function formatDate(value) {
  if (!value) {
    return "";
  }
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }
  return new Date(value).toLocaleString();
}

function formatTimeHour(value) {
  const hour = Number(String(value || "").slice(0, 2));
  if (!Number.isFinite(hour)) {
    return String(value || "");
  }

  const period = hour < 12 ? "AM" : "PM";
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:00 ${period}`;
}

function formatTransitDays(value) {
  if (value && typeof value === "object") {
    const minimum = Number(value.minimum);
    const maximum = Number(value.maximum);

    if (Number.isFinite(minimum) && Number.isFinite(maximum)) {
      if (minimum === maximum) {
        return `${minimum} day${minimum === 1 ? "" : "s"}`;
      }
      return `${minimum}-${maximum} days`;
    }

    if (Number.isFinite(maximum)) {
      return `${maximum} day${maximum === 1 ? "" : "s"}`;
    }

    if (Number.isFinite(minimum)) {
      return `${minimum} day${minimum === 1 ? "" : "s"}`;
    }
  }

  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const number = Number(text);
  if (Number.isFinite(number)) {
    return `${number} day${number === 1 ? "" : "s"}`;
  }

  return text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
