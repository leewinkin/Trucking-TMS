import { carrierStatusLine, pickupTimeErrorCodes, validatePickupReadyWindow } from "./quote-time-validation.js";
import {
  adminAttentionItems,
  adminCarrierChannels,
  adminCustomerOverview,
  adminDashboardMetrics,
  adminInvoiceMatchesFilter,
  adminQuoteConversion,
  adminQuoteMatchesFilter,
  adminRecordMatchesDateRange,
  adminRecentActivity,
  adminSetupChecklist,
  adminShipmentMatchesFilter,
  countUsableRates,
  isAdminQuoteIssue,
  isAdminReadyToBookQuote,
  isPreferenceExcludedQuote,
  lowestUsableSellPrice,
  quoteCarrierAuditSummary,
  quoteHasUsableRates
} from "./admin-dashboard.js";
import {
  adminAddressViewModel,
  adminFreightSummary,
  adminQuoteCarrierChannelRows,
  adminQuoteDetailsViewModel,
  adminQuoteFinancialSummary,
  adminQuoteRateRows,
  adminRateFinancials,
  adminTariffSummary,
  aggregateAdminFreightRows,
  diagnosticPayloadIsSafe,
  filterAdminQuoteRates,
  redactDiagnosticPayload,
  sortAdminQuoteRates
} from "./admin-quote-details.js";
import {
  accessorialChargeNotice,
  accessorialExplanation,
  accessorialLabel
} from "./accessorial-catalog.js";
import { buildQuoteIntakeApplicationPlan, parseQuoteIntakeText } from "./quote-intake-parser.js";
import {
  aggregateReadyQuoteAttentionItems,
  customerQuoteNumber,
  customerDashboardViewModel,
  customerVisibleRates,
  customerRateTransitDaysValue,
  isActiveShipment,
  isDeliveredThisMonth,
  isOpenInvoice,
  isQuoteReadyToBook,
  normalizeInvoiceStatus,
  normalizeQuoteStatus,
  normalizeShipmentStatus,
  quoteLowestSellPrice,
  quoteHasShipment,
  quoteStatusLabelKey,
  parseDate,
  recentByCreatedAt,
  reliableDeliveredDate,
  shipmentStatusLabelKey,
  shipmentStatusVariant,
  validCustomerSellPrice
} from "./customer-dashboard.js";
import {
  canEnableBookingMode,
  carrierModeMatrixRows,
  customerExplicitBookingModes,
  customerManagementDirtyAfterTabSwitch,
  customerManagementDraftFromPersisted,
  customerManagementHasUnsavedChanges,
  customerManagementSectionDirtyState,
  customerManagementSectionIsDirty,
  customerManagementViewModel,
  customerPortalStatusLabelKey,
  defaultCustomerManagementDirtySections,
  isCustomerManagementTabDisabled,
  mergeCustomerManagementDraftFromPersisted,
  shouldCaptureCustomerManagementDraft,
  customerStatusLabelKey,
  normalizeCustomerAccountStatus
} from "./customer-management.js";

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
    "Customer Portal": "客户门户",
    "Email or username": "邮箱或用户名",
    "Password": "密码",
    "Sign In": "登录",
    "Need access?": "需要权限？",
    "Sign in with your company employee account.": "使用你的公司员工账号登录。",
    "Checking server": "正在检查服务器",
    "Dashboard": "仪表盘",
    "Review your current shipping activity.": "查看您当前的报价、货件和账单状态。",
    "Operations Overview": "运营总览",
    "Monitor quotes, shipments, customers, invoices, and carrier activity.": "查看报价、货件、客户、账单和承运商运行情况。",
    "Last updated {time}": "最后更新：{time}",
    "Administrator / Staff": "管理员 / 员工",
    "Account": "账户信息",
    "System status": "系统状态",
    "Customers": "客户",
    "Customer": "客户",
    "Customer Management": "客户管理",
    "Quote Management": "报价管理",
    "Monitor quote activity and carrier results.": "查看报价动态和承运商结果。",
    "Shipment Management": "货件管理",
    "Invoice Management": "账单管理",
    "New Quote": "新建报价",
    "Shipments": "货件",
    "Invoices": "账单",
    "Invoice": "账单",
    "Quotes": "报价",
    "Edit": "编辑",
    "Logout": "退出登录",
    "Refresh": "刷新",
    "Refreshing...": "刷新中...",
    "Watch quote activity, shipment status, and invoice drafts.": "查看报价动态、货件状态和账单草稿。",
    "Track your quotes, shipments, and invoices.": "查看您的报价、货件和账单。",
    "Review your shipments.": "查看您的货件。",
    "Review your invoices.": "查看您的账单。",
    "Manage customer accounts and tariff rules.": "管理客户账户和客户加价规则。",
    "Review local bookings and carrier shipment references.": "查看本地运输预约和承运商货件引用。",
    "See draft invoices created from booked shipments.": "查看根据已预约货件创建的账单草稿。",
    "Your Account": "你的账户",
    "My Quotes": "我的报价",
    "My Shipments": "我的货件",
    "My Invoices": "我的账单",
    "Draft invoices": "草稿账单",
    "Recent Shipments": "最近货件",
    "Welcome back, {companyName}": "欢迎回来，{companyName}",
    "Manage your quotes, shipments, documents, and invoices.": "管理您的报价、货件、文件和账单。",
    "+ New Quote": "+ 新建报价",
    "Repeat Last Quote": "重复上次报价",
    "No previous quotes to repeat.": "暂无可重复的历史报价。",
    "Ready to Book": "可预约运输",
    "Ready to Book KPI": "可预约运输报价",
    "Active Shipments": "运输中货件",
    "Open Invoices": "未结清账单",
    "Delivered This Month": "本月已送达",
    "Quotes with available rates": "已有可用运价的报价",
    "Booked and moving shipments": "已预约或运输中的货件",
    "Invoices requiring review or payment": "需要查看或付款的账单",
    "Completed this calendar month": "本自然月已完成",
    "View quotes": "查看报价",
    "View shipments": "查看货件",
    "View invoices": "查看账单",
    "View delivered": "查看已送达",
    "Filter: {filter}": "筛选：{filter}",
    "Showing {filter}.": "当前查看：{filter}。",
    "Ready-to-book quotes": "可预约运输报价",
    "Active shipments": "运输中货件",
    "Open invoices": "未结清账单",
    "Delivered shipments this month": "本月已送达货件",
    "Booked": "已预约",
    "Pickup Scheduled": "已安排提货",
    "Picked Up": "已提货",
    "In Transit": "运输中",
    "Out for Delivery": "派送中",
    "Delivered": "已送达",
    "Exception": "运输异常",
    "Cancelled": "已取消",
    "Status Pending": "状态待更新",
    "All": "全部",
    "Clear Filter": "清除筛选",
    "Clear status": "清除状态",
    "Clear date range": "清除日期范围",
    "Clear all filters": "清除全部筛选",
    "Today": "今天",
    "Last 7 Days": "最近 7 天",
    "Last 30 Days": "最近 30 天",
    "All Time": "全部时间",
    "Date Range": "日期范围",
    "Created during the selected period.": "在所选时间范围内创建。",
    "Rates available and awaiting booking.": "已有运价，等待预约运输。",
    "No-rate or carrier-response issues.": "无报价或承运商响应异常。",
    "Booked or currently moving.": "已预约或正在运输。",
    "Shipments requiring operational review.": "需要运营人员处理的货件。",
    "Draft, unpaid, due, or overdue.": "草稿、未付款、到期或逾期账单。",
    "Quote Issues": "报价异常",
    "Shipment Exceptions": "货件异常",
    "No urgent items require attention.": "目前没有需要紧急处理的事项。",
    "Quote Conversion": "报价转化",
    "Quotes Created": "新建报价",
    "Quotes With Rates": "已返回运价的报价",
    "Booked Shipments": "已预约货件",
    "Delivered Shipments": "已送达货件",
    "Quote success rate": "报价成功率",
    "Quote-to-booking conversion": "报价转预约率",
    "Recent Activity": "最近活动",
    "No recent operational activity.": "暂无近期运营活动。",
    "Carrier Channels": "承运商渠道",
    "Configured": "已配置",
    "Not Configured": "未配置",
    "Unknown": "状态未知",
    "Healthy": "正常",
    "Degraded": "部分异常",
    "Error": "异常",
    "Booking enabled": "已启用在线预约",
    "Booking disabled": "未启用在线预约",
    "Last successful quote {time}": "最近成功报价：{time}",
    "Last error: {message}": "最近错误：{message}",
    "View diagnostics": "查看诊断",
    "System Setup": "系统设置",
    "{completed} of {total} setup steps completed": "已完成 {completed}/{total} 项设置",
    "Add at least one customer.": "至少添加一个客户。",
    "Configure customer tariff rules.": "配置客户加价规则。",
    "Configure at least one carrier channel.": "至少配置一个承运商渠道。",
    "Enable online booking for at least one customer.": "为至少一个客户启用在线运输预约。",
    "Create one successful quote.": "创建一个成功报价。",
    "Customer Overview": "客户概况",
    "Active customers": "活跃客户",
    "Disabled customers": "已禁用客户",
    "Missing tariff rules": "缺少加价规则",
    "Without carrier modes": "无承运商渠道",
    "Online booking enabled": "已启用在线预约运输",
    "No quote activity": "无报价活动",
    "Customers requiring configuration": "需要配置的客户",
    "Partial Failure": "部分渠道失败",
    "Filtered by Customer Preferences": "已按客户偏好过滤",
    "Customer Preferences": "客户偏好过滤",
    "No Rates": "暂无可用运价",
    "Failed": "报价失败",
    "Expired": "已过期",
    "Active": "启用",
    "Exceptions": "异常",
    "Draft": "草稿",
    "Open": "未结清",
    "Overdue": "逾期",
    "Paid": "已付款",
    "Import Issues": "导入异常",
    "Platform summary": "渠道结果汇总",
    "Partial platform failure": "部分渠道失败",
    "All platforms failed": "全部渠道失败",
    "No carrier audit": "暂无渠道请求记录",
    "No filter results.": "没有匹配结果。",
    "N/A": "不适用",
    "Shipment requires operational review.": "货件需要运营人员处理。",
    "Quote has no available rates.": "该报价没有可用运价。",
    "Some carrier channels did not return rates.": "部分承运商渠道未返回运价。",
    "Ready-to-book quote awaiting action.": "可预约运输的报价等待处理。",
    "Invoice is overdue.": "账单已逾期。",
    "Draft invoice awaiting review.": "草稿账单等待审核。",
    "Customer is missing tariff configuration.": "客户尚未设置加价规则。",
    "Customer has no allowed carrier modes.": "客户未启用承运商渠道。",
    "Customer account is disabled.": "客户账户已禁用。",
    "Quote created": "已创建报价",
    "Shipment status updated": "货件状态已更新",
    "Invoice created/imported": "账单已创建/导入",
    "Customer created": "客户已创建",
    "Customer updated": "客户已更新",
    "Quote completed with rates.": "报价已返回运价。",
    "Quote created.": "报价已创建。",
    "Shipment booked or moving.": "货件已预约或运输中。",
    "Invoice created or imported.": "账单已创建或导入。",
    "Customer created.": "客户已创建。",
    "Customer updated.": "客户已更新。",
    "Loading operations dashboard...": "正在加载运营总览...",
    "Dashboard data could not be refreshed. Please try again.": "仪表盘数据无法刷新，请重试。",
    "Documents could not be loaded.": "文件加载失败。",
    "Try Again": "重试",
    "No active shipments. Book a quote to start a shipment.": "当前没有运输中的货件，您可以先选择报价并预约运输。",
    "View Ready-to-Book Quotes": "查看可预约运输的报价",
    "View all shipments": "查看全部货件",
    "View Details": "查看详情",
    "Track": "查看轨迹",
    "Documents": "文件",
    "ETA": "预计送达时间",
    "Pickup date": "提货日期",
    "Needs Attention": "需要处理",
    "You're all caught up.": "目前没有需要处理的事项。",
    "Quote ready to book": "报价可预约运输",
    "Shipment requires attention": "货件需要关注",
    "Invoice overdue": "账单已逾期",
    "Invoice due soon": "账单即将到期",
    "Review quote": "查看报价",
    "Review shipment": "查看货件",
    "Review invoice": "查看账单",
    "Recent Quotes": "最近报价",
    "No quotes yet. Create your first quote.": "您还没有报价记录，请创建第一份报价。",
    "View all quotes": "查看全部报价",
    "View all": "查看全部",
    "Repeat Quote": "重复报价",
    "{count} more items": "还有 {count} 项",
    "{count} ready quotes": "{count} 个可预约运输报价",
    "Quote {quoteNumber}": "报价 {quoteNumber}",
    "Reference {reference}": "参考号 {reference}",
    "Use as New Quote": "复制为新报价",
    "Close": "关闭",
    "Price unavailable": "价格暂不可用",
    "Booking unavailable for this carrier.": "该承运商暂不支持在线预约运输。",
    "Online booking is not enabled for this account. Contact customer service for assistance.": "此账户暂未开启在线运输预约，如需安排运输请联系客服。",
    "Rates quoted on {dateTime}": "报价获取时间：{dateTime}",
    "These rates may no longer be available. Get updated rates before booking.": "这些运价可能已经失效，请重新获取最新运价后再预约运输。",
    "Expires {dateTime}": "有效期至 {dateTime}",
    "Lowest Price": "最低报价",
    "Fastest": "最快运输",
    "Fastest Transit": "最快运输",
    "Earliest ETA": "最早送达",
    "Search carrier": "搜索承运商",
    "Sort": "排序",
    "Load More": "加载更多",
    "Showing {visible}/{total} rates": "当前显示 {visible}/{total} 条运价",
    "Showing {visible} of {total} rates": "当前显示 {visible}/{total} 条运价",
    "Showing {visible} of {matching} matching rates · {total} total": "当前显示 {visible}/{matching} 条匹配运价 · 共 {total} 条",
    "No rates match your search.": "没有匹配的运价。",
    "Available Rates": "可用运价",
    "Quote Number": "报价编号",
    "Quote Status": "报价状态",
    "Quote Overview": "报价概览",
    "Route & Freight": "路线与货物",
    "Pricing & Profit": "价格与利润",
    "Carrier Channel Results": "承运商渠道结果",
    "Technical Diagnostics": "技术诊断",
    "Quote Expiration": "报价有效期",
    "Configured carrier channels": "已配置承运商渠道",
    "Available rate count": "可用运价数量",
    "Customer pricing rule": "客户加价规则",
    "Pricing rule unavailable": "加价规则不可用",
    "Carrier Cost": "承运商成本",
    "Customer Price": "客户报价",
    "Gross Profit": "预计毛利",
    "Margin": "毛利率",
    "Lowest Carrier Cost": "最低承运商成本",
    "Lowest Customer Price": "最低客户报价",
    "Highest Gross Profit": "最高预计毛利",
    "Highest Margin": "最高毛利率",
    "Bookable": "可在线预约",
    "Booking Unavailable": "不可在线预约",
    "Negative Margin": "负毛利",
    "All Channels": "全部渠道",
    "Channel": "渠道",
    "Carrier Name": "承运商名称",
    "Bookable rates only": "仅显示可预约运价",
    "No rates match your filters.": "没有符合筛选条件的运价。",
    "No carrier channels recorded.": "未记录承运商渠道。",
    "Success": "成功",
    "Partial": "部分成功",
    "Excluded by Customer Settings": "已按客户设置排除",
    "Not Attempted": "未请求",
    "{count} rate(s) returned": "返回 {count} 条运价",
    "Carrier quote ID": "承运商报价 ID",
    "Online booking supported": "支持在线预约运输",
    "Online booking unavailable": "暂不支持在线预约运输",
    "Copy Sanitized Request": "复制已脱敏请求",
    "Copy Sanitized Response": "复制已脱敏响应",
    "Sanitized diagnostic copied.": "已复制脱敏诊断数据。",
    "Copy failed. Select and copy the diagnostic manually.": "复制失败，请手动选择并复制诊断数据。",
    "Sanitized diagnostic failed safety validation and cannot be copied.": "脱敏诊断数据未通过安全校验，无法复制。",
    "No rates": "暂无运价",
    "rate(s)": "条运价",
    "Customer price unavailable": "客户报价不可用",
    "Quote is not bookable": "该报价不可预约运输",
    "Created": "创建时间",
    "Pickup company": "提货公司",
    "Pickup address": "提货地址",
    "Delivery company": "收货公司",
    "Delivery address": "收货地址",
    "Pickup ready": "可提货时间",
    "Total handling units": "总包装单位数",
    "Total pieces": "总件数",
    "Total weight": "总重量",
    "Freight class": "货运等级",
    "Dimensions": "尺寸",
    "Packaging": "包装",
    "Pieces": "件数",
    "Weight each": "单件重量",
    "Distinct freight groups": "货物组数",
    "Description": "货物描述",
    "Pickup accessorials": "提货附加服务",
    "Delivery accessorials": "派送附加服务",
    "Available rates": "可用运价",
    "available rate(s)": "条可用运价",
    "usable rate(s)": "条有效运价",
    "Lowest price": "最低报价",
    "Quick Actions": "快捷操作",
    "Dashboard actions": "仪表盘操作",
    "View Saved Addresses": "查看地址簿",
    "Contact Support": "联系客服",
    "Customer support": "客户服务",
    "Please contact customer service for help with your shipment, invoice, or quote.": "如需货件、账单或报价帮助，请联系客服。",
    "Track Shipment": "追踪货件",
    "Tracking": "货件追踪",
    "Track a shipment": "追踪货件",
    "Enter a confirmation number or PO/reference number.": "请输入确认号或 PO/参考号。",
    "Confirmation or PO/reference number": "确认号或 PO/参考号",
    "Search": "搜索",
    "Search operations": "搜索运营数据",
    "Search by quote, PO, shipment, invoice, or customer.": "按报价、PO、货件、账单或客户搜索。",
    "Search terms": "搜索内容",
    "No search results.": "没有搜索结果。",
    "Carrier Diagnostics": "承运商渠道诊断",
    "Failed quotes": "失败报价",
    "No matching shipments found.": "未找到匹配货件。",
    "Select a shipment": "选择货件",
    "Bill of Lading": "提单（BOL）",
    "Proof of Delivery": "签收回单（POD）",
    "Other Documents": "其他文件",
    "Available": "可用",
    "Pending": "待处理",
    "Unavailable": "不可用",
    "Loading customer dashboard...": "正在加载客户仪表盘...",
    "Next Setup Steps": "下一步设置",
    "Add real customers.": "添加真实客户。",
    "Set customer markup rules.": "设置客户加价规则。",
    "Add your SpeedShip LTL sandbox credentials to backend env.": "将 SpeedShip LTL 沙箱凭证添加到后端环境变量。",
    "Add your Mothership sandbox token to backend env.": "将 Mothership 沙箱令牌添加到后端环境变量。",
    "Run one LTL sandbox quote before expanding carrier options.": "在扩展承运商选项前先跑一次 LTL 沙箱报价。",
    "Run one sandbox quote before enabling carrier booking.": "在启用承运商在线预约前先跑一次沙箱报价。",
    "Manage customer accounts, pricing, carrier channels, portal access, and blocked carriers.": "管理客户账户、加价规则、承运商渠道、门户访问和屏蔽承运商。",
    "+ Add Customer": "+ 添加客户",
    "Search customers...": "搜索客户...",
    "Status": "状态",
    "Configuration": "配置",
    "Total Customers": "客户总数",
    "Configuration Incomplete": "配置不完整",
    "Configuration complete": "配置完整",
    "Missing Tariff": "缺少加价规则",
    "No Carrier Modes": "未启用承运商渠道",
    "Online Booking Disabled": "未启用在线预约",
    "Portal Not Configured": "未配置客户门户",
    "Recently Updated": "最近更新",
    "Company Name": "公司名称",
    "Most Quotes": "报价数量",
    "Most Shipments": "货件数量",
    "Quote channels": "报价渠道",
    "customerManagement.onlineBooking": "在线预约",
    "Pricing rule": "加价规则",
    "Last 30 days": "最近 30 天",
    "{count} quotes": "{count} 条报价",
    "{count} shipments": "{count} 个货件",
    "More": "更多",
    "Enable": "启用",
    "Disable": "停用",
    "Delete": "删除",
    "Delete Customer": "删除客户",
    "Basic Information": "基本资料",
    "Pricing & Channels": "加价与渠道",
    "Customer created. Configure pricing and carrier channels.": "客户已创建，请继续配置加价规则和承运商渠道。",
    "Customer save in progress...": "正在保存客户...",
    "Tariff save in progress...": "正在保存加价规则...",
    "Blocked carriers are loading...": "正在加载屏蔽承运商...",
    "No customers match your search or filters.": "没有匹配搜索或筛选条件的客户。",
    "Unsaved changes will be lost. Continue?": "未保存的更改将会丢失。是否继续？",
    "Unsaved": "未保存",
    "Type {name} to confirm deletion.": "请输入 {name} 以确认删除。",
    "Deleting this customer may affect related quotes, shipments, and invoices.": "删除此客户可能影响相关报价、货件和账单。",
    "Delete confirmation did not match the company name.": "删除确认与公司名称不一致。",
    "Markup percentage": "加价比例",
    "Pricing & carrier channels": "加价与承运商渠道",
    "Carrier Channel": "承运商渠道",
    "Get Rates": "获取运价",
    "Mothership Sandbox": "Mothership 测试环境",
    "Demo Rates": "测试费率（仅限内部测试）",
    "Online booking can only be enabled for channels that are enabled for quoting.": "只有已启用报价的承运商渠道才能开启在线预约。",
    "Demo Rates is for internal testing only.": "测试费率仅限内部测试使用。",
    "Example calculation": "示例计算",
    "Carrier cost": "承运商成本",
    "Customer price": "客户报价",
    "This rule changes the customer quote price and does not change carrier cost.": "此规则只影响客户报价，不改变承运商成本。",
    "Save pricing for {name}": "保存 {name} 的加价与渠道",
    "Save basic information": "保存基本资料",
    "Save portal access": "保存门户访问",
    "Portal status": "门户状态",
    "Configured portal username": "已配置门户用户名",
    "New temporary password": "新的临时密码",
    "Show password": "显示密码",
    "Hide password": "隐藏密码",
    "Generate temporary password": "生成临时密码",
    "Copy temporary password": "复制临时密码",
    "Copy failed. Select and copy the temporary password manually.": "复制失败，请在输入框中手动选择并复制临时密码。",
    "Leave blank to keep the existing password.": "留空则保留现有密码。",
    "Opening time must be earlier than closing time.": "营业开始时间必须早于营业结束时间。",
    "Password could not be generated securely.": "无法安全生成密码。",
    "Not enabled": "未启用",
    "Blocking carrier...": "正在屏蔽承运商...",
    "No customer selected.": "未选择客户。",
    "View customer details": "查看客户详情",
    "Open customer drawer": "打开客户抽屉",
    "Customer management is available to staff users only.": "客户管理仅供员工账号使用。",
    "Enter the customer's basic information and optional portal access.": "填写客户基本资料和可选的门户账户信息。",
    "Customer Accounts": "客户账户",
    "Company name": "公司名称",
    "Billing email": "账单邮箱",
    "Payment terms": "付款条款",
    "Company phone": "公司电话",
    "Company street": "公司地址",
    "Company city": "公司城市",
    "Company state": "公司州",
    "Company ZIP": "公司邮编",
    "No billing email": "无账单邮箱",
    "No portal user": "无门户用户",
    "Your account": "你的账户",
    "Select a customer": "选择客户",
    "Book after quote": "报价后可预约运输",
    "Quote only": "仅报价",
    "Carrier mode": "承运商模式",
    "None": "无",
    "Portal username": "门户用户名",
    "Portal password": "门户密码",
    "Account status": "账户状态",
    "Disabled": "禁用",
    "Add Customer": "添加客户",
    "Tariff Rule": "客户加价规则",
    "Tariff rule": "客户加价规则",
    "Tariff": "加价规则",
    "Blocked Carriers": "屏蔽承运商",
    "Carrier code or name": "承运商代码或名称",
    "Display name": "显示名称",
    "Reason": "原因",
    "Optional internal reason": "可选内部原因",
    "Block Carrier": "屏蔽承运商",
    "Blocked carrier added.": "已添加屏蔽承运商。",
    "Blocked carrier removed.": "已移除屏蔽承运商。",
    "No blocked carriers.": "暂无屏蔽承运商。",
    "Rule type": "规则类型",
    "Fixed markup": "固定加价",
    "Percentage markup": "百分比加价",
    "Fixed amount": "固定金额",
    "Markup percent": "加价百分比",
    "Markup": "加价",
    "fixed": "固定",
    "no tariff": "未设置加价规则",
    "Booking": "运输预约",
    "Allowed carrier modes": "允许的承运商模式",
    "Allowed booking modes": "允许在线预约的承运商渠道",
    "Mothership sandbox": "Mothership 测试环境",
    "SpeedShip LTL": "SpeedShip LTL",
    "Priority1 LTL": "Priority1 LTL",
    "FedEx Freight": "FedEx Freight",
    "Demo rates": "测试费率（仅限内部测试）",
    "Customers can book only the selected carrier modes. Uncheck all to disable booking.": "客户只能通过已选择的承运商渠道进行在线运输预约。取消全选可禁用在线预约。",
    "Quotes for this customer will pull rates from every selected carrier mode.": "该客户的报价会从所有已选承运商模式拉取费率。",
    "Save Tariff": "保存加价规则",
    "Save Changes": "保存更改",
    "Smart Quote Intake": "智能报价录入",
    "Paste shipment details, preview parsed fields, then apply them to the quote form.": "粘贴货件信息，预览解析字段后再应用到报价表单。",
    "Paste quote details": "粘贴报价信息",
    "Paste pickup, delivery, freight, and accessorial notes here.": "在此粘贴提货、派送、货物和附加服务说明。",
    "Parse": "解析",
    "Clear": "清空",
    "Parsed fields": "已解析字段",
    "Apply to Form": "应用到表单",
    "Smart intake parsed {count} field(s).": "智能录入已解析 {count} 个字段。",
    "Paste quote details before parsing.": "请先粘贴报价信息再解析。",
    "No fields were parsed. Review the notes and update the form manually.": "未解析出字段。请查看备注并手动填写表单。",
    "Smart intake applied {count} field(s).": "智能录入已应用 {count} 个字段。",
    "Smart intake cleared.": "智能录入已清空。",
    "Applying this import will replace {count} non-empty field(s). Continue?": "应用本次导入将替换 {count} 个已有字段。是否继续？",
    "Confidence": "置信度",
    "High confidence": "高置信度",
    "Medium confidence": "中等置信度",
    "Low confidence": "低置信度",
    "Unmatched notes": "未匹配备注",
    "No unmatched notes.": "没有未匹配备注。",
    "No parsed fields yet.": "尚未解析字段。",
    "Review required / not applied": "需要人工确认 / 未应用",
    "Converted before applying": "应用前已换算",
    "Yes": "是",
    "No": "否",
    "Pickup facility code": "提货仓库代码",
    "Delivery facility code": "派送仓库代码",
    "Pickup opening time": "提货营业开始时间",
    "Pickup closing time": "提货营业结束时间",
    "Delivery opening time": "派送营业开始时间",
    "Delivery closing time": "派送营业结束时间",
    "Packaging type": "包装类型",
    "Weight unit": "重量单位",
    "Dimension unit": "尺寸单位",
    "Customer and Mode": "客户与模式",
    "If the selected customer has an address on file, pickup will prefill from it.": "如果所选客户已有地址记录，提货信息会自动带出。",
    "Rates will use the carrier modes assigned to the selected customer.": "费率会使用所选客户已分配的承运商模式。",
    "Pickup": "提货",
    "Quote details": "报价详情",
    "Reference / PO number": "参考号 / PO 号",
    "Ready time": "货物可提时间",
    "Company and address": "公司与地址",
    "Street": "街道",
    "City": "城市",
    "State": "州",
    "ZIP": "邮编",
    "Contact and hours": "联系信息与营业时间",
    "Phone": "电话",
    "Email": "邮箱",
    "Accessorials": "附加服务",
    "Choose saved address": "选择已保存地址",
    "Save current address": "保存当前地址",
    "Update saved address": "更新已保存地址",
    "Address nickname": "地址昵称",
    "Main warehouse": "主仓库",
    "Main consignee": "主要收货方",
    "Save as": "保存为",
    "Pickup and delivery": "提货与派送",
    "Default pickup": "默认提货地址",
    "Default delivery": "默认派送地址",
    "Address saved.": "地址已保存。",
    "Address updated.": "地址已更新。",
    "Could not save address.": "无法保存地址。",
    "Could not update address.": "无法更新地址。",
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
    "Delivery": "派送",
    "Scheduled delivery": "预约派送",
    "Residential delivery may require an appointment or other accessorial services. Select them based on the actual delivery requirements.": "住宅派送可能需要预约或其他附加服务，请根据实际派送要求选择。",
    "Freight": "货物信息",
    "Apply suggestions to all items": "为全部货物应用建议等级",
    "Add Item": "添加条目",
    "Quote Results": "报价结果",
    "Submit a quote to see available rates.": "提交报价后即可查看可用运价。",
    "Mothership invoice sync": "Mothership 账单同步",
    "Pull existing carrier invoices into the admin invoice list.": "将现有承运商账单拉取到管理员账单列表中。",
    "Ready for sync": "准备同步",
    "Sync from Mothership": "从 Mothership 同步",
    "Details": "详情",
    "Item 1": "条目 1",
    "One row equals one freight line.": "每一行代表一项货物明细。",
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
    "Pieces per unit": "每个包装单位的件数",
    "Weight each (lbs)": "每个包装单位重量（磅）",
    "Weight each (kg)": "每个包装单位重量（千克）",
    "Length": "长度",
    "Width": "宽度",
    "Height": "高度",
    "Length (in)": "长度（英寸）",
    "Width (in)": "宽度（英寸）",
    "Height (in)": "高度（英寸）",
    "Length (cm)": "长度（厘米）",
    "Width (cm)": "宽度（厘米）",
    "Height (cm)": "高度（厘米）",
    "Select class": "选择货运等级",
    "Optional NMFC": "可选 NMFC",
    "Stackable": "可堆叠",
    "Used": "二手",
    "Machinery": "机械设备",
    "Suggested freight class: enter quantity, weight, and dimensions to calculate one.": "建议货运等级：输入数量、重量和尺寸后即可计算。",
    "Suggested freight class: calculating...": "建议货运等级：计算中...",
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
    "Tariff saved.": "加价规则已保存。",
    "Carrier returned no rates for this lane.": "该线路未返回运价。",
    "Syncing...": "同步中...",
    "Sync in progress": "同步进行中",
    "Synced {count} invoices": "已同步 {count} 张账单",
    "Sync failed": "同步失败",
    "Mothership sync complete.": "Mothership 同步完成。",
    "Mothership sync complete: {created} created, {updated} updated.": "Mothership 同步完成：新增 {created} 条，更新 {updated} 条。",
    "created.": "已创建。",
    "updated.": "已更新。",
    "Could not sync Mothership invoices.": "无法同步 Mothership 账单。",
    "Request failed.": "请求失败。",
    "Signed in as {email}.": "已登录为 {email}。",
    "Quote details copied into New Quote.": "报价详情已复制到新报价。",
    "Customer deleted.": "客户已删除。",
    "Customer {status}.": "客户已{status}。",
    "Delete {name}? This removes the customer and related data.": "删除 {name}？这会移除客户及相关数据。",
    "Please fill in the required fields.": "请填写必填字段。",
    "This Mothership quote is not purchasable yet.": "该 Mothership 报价暂时无法下单。",
    "Mothership needs:": "Mothership 需要：",
    "Select time": "选择时间",
    "Pickup open time must be earlier than pickup close time.": "提货开始时间必须早于结束时间。",
    "Pickup ready time must not be earlier than pickup opening time.": "提货准备时间不能早于提货开始时间。",
    "Pickup ready time must be earlier than pickup close time.": "提货准备时间必须早于提货结束时间。",
    "Enter valid pickup times.": "请输入有效的提货时间。",
    "Use pickup opening time": "使用提货开始时间",
    "Pickup ready time was adjusted to the pickup opening time.": "提货准备时间已调整为提货开始时间。",
    "Carrier status": "承运商状态",
    "{provider}: {count} rate(s) returned.": "{provider}：返回 {count} 条运价。",
    "No {provider} rates: {message}": "{provider} 未返回运价：{message}",
    "No Mothership rates: pickup ready time is earlier than pickup opening time.": "无 Mothership 报价：提货准备时间早于提货开始时间。",
    "No rates are currently available. Please contact customer service.": "当前暂无可用运价，请联系客服。",
    "No rates are available based on your current carrier preferences.": "根据您当前的承运商偏好，暂无可用运价。",
    "Some rates are temporarily unavailable. The available results are shown below. Please try again later or contact customer service.": "部分运价暂时未能返回，以下为当前可用运价。请稍后重试或联系客服。",
    "Contracted Carrier": "合作承运商",
    "Select a customer to see the carrier modes assigned by admin.": "选择客户后可查看管理员分配的承运商模式。",
    "Your quote uses the carrier modes assigned to your account: {label}.": "你的报价将使用分配到你账户的承运商模式：{label}。",
    "Assigned carrier modes for {name}: {label}.": "{name} 的已分配承运商模式：{label}。",
    "Applying freight class suggestions to all items.": "正在为全部货物应用建议等级。",
    "Applied freight class suggestions to {count} item{suffix}.": "已为 {count} 项货物应用建议等级{suffix}。",
    "Add quantity, weight, and dimensions to calculate freight class suggestions.": "请填写数量、重量和尺寸以计算建议货运等级。",
    "Suggested freight class: {value}": "建议货运等级：{value}",
    "View Quote": "查看报价",
    "View Shipment": "查看货件",
    "BOL": "提单",
    "POD": "签收证明",
    "View BOL": "查看提单",
    "View POD": "查看签收回单",
    "View Payload": "查看原始数据",
    "View Invoice": "查看账单",
    "Open document": "打开文档",
    "Self-owned Truck": "自有卡车",
    "Mothership": "Mothership",
    "Local": "本地",
    "invoice reference": "账单参考",
    "import": "导入",
    "TMS Reference / PO": "TMS 参考号 / PO",
    "Quote Summary": "报价摘要",
    "Quote Audit": "渠道请求记录",
    "Rates": "运价明细",
    "Re-enter Quote": "重新录入报价",
    "Reference only": "仅参考记录",
    "Waiting for detail fields": "等待明细字段",
    "Carrier request completed": "承运商请求完成",
    "Carriers": "承运商",
    "connection succeeded": "连接成功",
    "Rate results are loading": "运价结果正在加载",
    "Please wait while we contact the carrier platforms.": "请稍候，我们正在联系承运商平台。",
    "Load more results": "加载更多结果",
    "Showing {visible} of {total} results": "显示 {visible} / {total} 条结果",
    "Book Shipment": "预约运输",
    "Booking disabled for this carrier.": "该承运商暂不支持在线运输预约。",
    "No shipments yet.": "暂无货件。",
    "No shipments booked yet.": "暂无已预约货件。",
    "Imported from Mothership": "从 Mothership 导入",
    "Other invoices": "其他账单",
    "Invoices hydrated from the carrier invoice sync.": "由承运商账单同步填充的账单。",
    "Invoices created locally from booked shipments.": "根据已预约货件在本地创建的账单。",
    "No Mothership invoices imported yet.": "尚未导入 Mothership 账单。",
    "No local invoices yet.": "暂无本地账单。",
    "invoice hidden in the other tab.": "条账单隐藏在另一个标签页中。",
    "No customers yet.": "暂无客户。",
    "No quotes yet.": "暂无报价。",
    "No invoices yet.": "暂无账单。",
    "No rate details.": "暂无运价明细。",
    "Purchasable": "可下单",
    "Not purchasable": "暂不可下单",
    "Outbound request": "发送给承运商的请求",
    "Carrier response": "承运商返回数据",
    "No carrier audit data recorded for this quote.": "该报价暂无渠道请求记录。",
    "No tracking events yet.": "暂无运输轨迹。",
    "Quote Details": "报价详情",
    "Tracking {confirmationNumber}": "运输轨迹 {confirmationNumber}",
    "Loading tracking details...": "正在加载运输轨迹...",
    "Tracking lookup failed.": "运输轨迹查询失败。",
    "Carrier Documents": "承运商文档",
    "Document": "文档",
    "Loading proof of delivery...": "正在加载送货回单...",
    "Loading bill of lading...": "正在加载提单...",
    "POD lookup failed.": "回单查询失败。",
    "BOL lookup failed.": "提单查询失败。",
    "POD is not here yet.": "回单尚未返回。",
    "No bill of lading was returned for this shipment yet.": "该货件尚未返回提单。",
    "POD is in your actual Mothership account, please log in to download.": "回单在你的真实 Mothership 账户中，请登录后下载。",
    "Proof of Delivery {id}": "送货回单 {id}",
    "Bill of Lading {id}": "提单 {id}",
    "Confirm Shipment Booking": "确认预约运输",
    "Confirm shipment booking": "确认预约运输",
    "This will finalize the shipment with the carrier platform.": "这会将所选运价提交给承运商平台安排运输。",
    "This will submit the selected rate for shipment booking. Please confirm before continuing.": "系统将使用所选运价提交运输预约，请确认信息后继续。",
    "This will create a shipment booking in the TMS.": "这将在 TMS 中创建运输预约。",
    "Please confirm before continuing.": "请确认后继续。",
    "Booking status": "预约状态",
    "Ready for online booking.": "可在线预约运输。",
    "This rate cannot be booked online. Please choose another rate or contact customer service.": "此运价暂无法在线预约运输，请选择其他运价或联系客服。",
    "Booking blocked by Mothership": "Mothership 阻止运输预约",
    "Purchase eligibility": "可下单状态",
    "Fix these fields": "请修正以下字段",
    "Pickup suggestions": "提货建议",
    "Delivery suggestions": "送货建议",
    "No outbound request recorded for this quote.": "该报价未记录发送给承运商的请求。",
    "No carrier response recorded for this quote.": "该报价未记录承运商返回数据。",
    "Cancel": "取消",
    "Confirm Booking": "确认预约",
    "Shipment Summary": "货件摘要",
    "Last update": "最近更新",
    "No tracking updates yet": "暂无运输轨迹更新",
    "Tracking Timeline": "运输轨迹",
    "Shipment booking is disabled for this carrier.": "该承运商暂不支持在线运输预约。",
    "Could not book shipment.": "无法完成运输预约。",
    "Booked {confirmationNumber}.": "运输预约已完成，确认号：{confirmationNumber}。",
    "Carrier": "承运商",
    "Service": "服务",
    "Reference / PO": "参考号 / PO",
    "Lane": "运输路线",
    "Cost": "成本",
    "Your Price": "您的报价",
    "Mothership status": "Mothership 状态",
    "No SCAC": "无 SCAC",
    "Offer": "运价编号",
    "Transit": "运输时效",
    "PO": "PO",
    "This invoice is not linked to a Mothership entity ID.": "该账单未关联到 Mothership 实体 ID。",
    "Amount": "金额",
    "Issued": "开单日期",
    "Due": "到期日",
    "Shipment": "货件",
    "Mothership invoice id": "Mothership 账单 ID",
    "Pending detail import": "等待明细导入",
    "POD is only available when Mothership returns a carrier entity ID for this invoice.": "仅当 Mothership 为此账单返回承运商实体 ID 时，POD 才可用。",
    "Mothership returned this record through the modified invoices feed, but the current sync does not yet have resolved amount, PO, or invoice detail fields for this item.": "Mothership 通过更新后的账单数据流返回了这条记录，但当前同步尚未解析出金额、PO 或账单明细字段。",
    "Invoice Reference": "账单参考",
    "Invoice Summary": "账单摘要",
    "Not available": "不可用",
    "Not set": "未设置",
    "No invoice line items were returned.": "未返回账单明细。",
    "Mothership Payload": "Mothership 原始数据",
    "Invoice Line Items": "账单明细",
    "No raw Mothership payload was recorded for this invoice.": "未记录 Mothership 原始数据。",
    "This raw payload is shown to admins so we can map the real Mothership invoice fields from your account.": "管理员可查看该原始数据，以便将你账户里的 Mothership 账单字段映射出来。",
    "Line Item {n}": "明细 {n}",
    "Invoice line item": "账单明细",
    "No data recorded.": "未记录数据。",
    "Invoice groups": "账单分组",
    "My Portal": "我的门户",
    "Recent Invoices": "最近账单",
    "Online booking": "在线预约运输",
    "Booking unavailable for this carrier": "该承运商暂不支持在线预约运输。",
    "Apply suggestions to all items.": "为全部货物应用建议等级。",
    "Payload": "原始数据",
    "No raw Mothership payload was recorded for this quote.": "未记录 Mothership 原始数据。",
    "Mothership invoice ID": "Mothership 账单 ID",
    "action.close": "关闭",
    "business.openingTime": "营业开始时间",
    "business.closingTime": "营业结束时间",
    "invoice.status.open": "未结清",
    "shipment.filter.active": "运输中",
    "account.status.active": "启用",
    "account.status.disabled": "已停用",
    "document.status.pending": "待生成",
    "operation.status.pending": "待处理"
  },
  en: {
    "action.close": "Close",
    "business.openingTime": "Opening time",
    "business.closingTime": "Closing time",
    "High confidence": "High confidence",
    "Medium confidence": "Medium confidence",
    "Low confidence": "Low confidence",
    "invoice.status.open": "Open",
    "shipment.filter.active": "Active",
    "account.status.active": "Active",
    "account.status.disabled": "Disabled",
    "customerManagement.onlineBooking": "Online Booking",
    "document.status.pending": "Pending",
    "operation.status.pending": "Pending"
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
  renderQuotesView();
  renderDashboard();
  renderCustomers({ forceControls: true });
  renderUserChip();
  updateRolePresentation();
  const portalSubtitle = document.getElementById("portalSubtitle");
  if (portalSubtitle) {
    portalSubtitle.textContent = isCustomerUser() ? t("Customer Portal") : t("Operations portal");
  }
  populateTimeSelects();
  enhanceAccessorialDropdowns();
  document.querySelectorAll(".accessorial-dropdown").forEach((details) => syncAccessorialDropdown(details));
  renderQuoteIntakePreview();
  updateFreightClassSuggestion();
}

function t(text, params = {}) {
  const dictionary = translations[state.language] || {};
  const englishDictionary = translations.en || {};
  let translated = dictionary[text] || englishDictionary[text] || text;
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
  addressBookEntries: [],
  carrierPreferences: [],
  quotes: [],
  shipments: [],
  invoices: [],
  currentQuote: null,
  quoteLoading: false,
  quoteResultsLimit: 12,
  quoteIntake: null,
  freightSuggestionTimer: null,
  freightSuggestionRequestToken: 0,
  carrierModeTouched: false,
  pendingQuoteReentry: null,
  pendingBooking: null,
  invoiceTab: "mothership",
  dashboardLoading: false,
  dashboardError: "",
  dashboardFilter: "",
  staffDashboardRange: "last7",
  lastSuccessfulRefreshAt: "",
  staffFilters: {
    quotes: "all",
    shipments: "all",
    invoices: "all"
  },
  staffFilterRanges: {
    quotes: "all",
    shipments: "all",
    invoices: "all"
  },
  customerFilters: {
    quotes: "all",
    shipments: "all",
    invoices: "all"
  },
  customerQuoteDetails: {
    quoteId: "",
    visibleCount: 12,
    sort: "lowestPrice",
    search: ""
  },
  adminQuoteDetails: {
    quoteId: "",
    search: "",
    sort: "customerPrice",
    sourceFilter: "all",
    bookableOnly: false,
    visibleCount: 20,
    diagnosticsOpen: false
  },
  customerManagement: {
    query: "",
    statusFilter: "all",
    configurationFilter: "all",
    sort: "recent",
    selectedCustomerId: "",
    drawerMode: "",
    drawerTab: "basic",
    dirty: false,
    dirtySections: {
      basic: false,
      pricing: false,
      portal: false,
      blocked: false
    },
    temporaryPassword: "",
    saving: "",
    blockedCarrierLoading: false,
    error: "",
    draft: {
      basic: {},
      pricing: {},
      portal: {},
      blocked: {},
      carrierModes: {
        allowedCarrierModes: [],
        allowedBookingCarrierModes: []
      }
    }
  },
  lastModalFocus: null,
  modal: null
};

const zipLookupTimers = new WeakMap();
const zipLookupTokens = new WeakMap();
const freightSuggestionTimers = new WeakMap();
const freightSuggestionTokens = new WeakMap();
const accessorialTooltipState = {
  button: null,
  dismissalBound: false
};

const viewMeta = {
  dashboard: () =>
    isCustomerUser()
      ? [t("Dashboard"), t("Review your current shipping activity.")]
      : [t("Operations Overview"), t("Monitor quotes, shipments, customers, invoices, and carrier activity.")],
  customers: () => [t("Customer Management"), t("Manage customer accounts and tariff rules.")],
  quotes: () => isCustomerUser() ? [t("My Quotes"), t("Track your quotes, shipments, and invoices.")] : [t("Quote Management"), t("Monitor quote activity and carrier results.")],
  quote: () => [t("New Quote"), ""],
  shipments: () => isCustomerUser() ? [t("My Shipments"), t("Review your shipments.")] : [t("Shipment Management"), t("Review local bookings and carrier shipment references.")],
  invoices: () => isCustomerUser() ? [t("My Invoices"), t("Review your invoices.")] : [t("Invoice Management"), t("See draft invoices created from booked shipments.")]
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
    button.addEventListener("click", () => setView(button.dataset.view, { resetCustomerFilter: true }));
  });

  bindDashboardModalButtons();

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

    const bookRateButton = event.target.closest("[data-book-rate]");
    if (bookRateButton) {
      const quoteId = bookRateButton.dataset.bookQuote || state.currentQuote?.id;
      if (quoteId) {
        openBookingConfirmation(quoteId, bookRateButton.dataset.bookRate);
      }
      return;
    }

    const customerQuoteLoadMoreButton = event.target.closest("[data-customer-quote-load-more]");
    if (customerQuoteLoadMoreButton) {
      loadMoreCustomerQuoteDetailsRates(customerQuoteLoadMoreButton.dataset.customerQuoteLoadMore);
      return;
    }

    const adminQuoteLoadMoreButton = event.target.closest("[data-admin-quote-load-more]");
    if (adminQuoteLoadMoreButton) {
      loadMoreAdminQuoteDetailsRates(adminQuoteLoadMoreButton.dataset.adminQuoteLoadMore);
      return;
    }

    const adminQuoteCloseButton = event.target.closest("[data-admin-quote-close]");
    if (adminQuoteCloseButton) {
      closeModal();
      return;
    }

    const diagnosticCopyButton = event.target.closest("[data-copy-sanitized-diagnostic]");
    if (diagnosticCopyButton) {
      copySanitizedDiagnostic(diagnosticCopyButton);
      return;
    }

    const customerQuoteRequoteButton = event.target.closest("[data-customer-quote-reenter]");
    if (customerQuoteRequoteButton) {
      reenterQuote(customerQuoteRequoteButton.dataset.customerQuoteReenter);
      return;
    }

    const customerQuoteCloseButton = event.target.closest("[data-customer-quote-close]");
    if (customerQuoteCloseButton) {
      closeModal();
      return;
    }

    const staffActionButton = event.target.closest("[data-staff-dashboard-action]");
    if (staffActionButton) {
      handleStaffDashboardAction(staffActionButton.dataset.staffDashboardAction);
      return;
    }

    const staffFilterButton = event.target.closest("[data-staff-filter-view]");
    if (staffFilterButton) {
      setStaffFilter(staffFilterButton.dataset.staffFilterView, staffFilterButton.dataset.staffFilter || "all");
      return;
    }

    const staffClearDateButton = event.target.closest("[data-staff-clear-date-range]");
    if (staffClearDateButton) {
      clearStaffDateRangeFilter(staffClearDateButton.dataset.staffClearDateRange);
      return;
    }

    const staffClearAllButton = event.target.closest("[data-staff-clear-all-filters]");
    if (staffClearAllButton) {
      clearAllStaffFilters(staffClearAllButton.dataset.staffClearAllFilters);
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

    const dashboardActionButton = event.target.closest("[data-customer-dashboard-action]");
    if (dashboardActionButton) {
      handleCustomerDashboardAction(dashboardActionButton.dataset.customerDashboardAction);
      return;
    }

    const dashboardFilterButton = event.target.closest("[data-dashboard-filter]");
    if (dashboardFilterButton) {
      if (!isCustomerUser()) {
        navigateStaffDashboardFilter(dashboardFilterButton.dataset.dashboardFilter);
        return;
      }
      navigateCustomerDashboardFilter(dashboardFilterButton.dataset.dashboardFilter);
      return;
    }

    const customerFilterButton = event.target.closest("[data-customer-filter]");
    if (customerFilterButton) {
      setCustomerFilter(customerFilterButton.dataset.customerFilterView, customerFilterButton.dataset.customerFilter);
      return;
    }

    const customerDocumentsButton = event.target.closest("[data-customer-documents]");
    if (customerDocumentsButton) {
      openCustomerShipmentDocuments(customerDocumentsButton.dataset.customerDocuments);
      return;
    }

    const trackSearchButton = event.target.closest("[data-track-search]");
    if (trackSearchButton) {
      runTrackShipmentSearch();
      return;
    }

    const staffSearchButton = event.target.closest("[data-staff-search-submit]");
    if (staffSearchButton) {
      runStaffSearch();
      return;
    }

    const staffSearchResult = event.target.closest("[data-staff-search-result]");
    if (staffSearchResult) {
      openStaffSearchResult(staffSearchResult.dataset.staffSearchType, staffSearchResult.dataset.staffSearchResult);
      return;
    }

    const trackResultButton = event.target.closest("[data-track-result]");
    if (trackResultButton) {
      openShipmentTracking(trackResultButton.dataset.trackResult);
      return;
    }

    const deleteCarrierPreferenceButton = event.target.closest("[data-delete-carrier-preference]");
    if (deleteCarrierPreferenceButton) {
      deleteCarrierPreference(deleteCarrierPreferenceButton.dataset.deleteCarrierPreference);
      return;
    }

    const addCustomerButton = event.target.closest("[data-customer-management-add]");
    if (addCustomerButton) {
      openCustomerManagementDrawer("", "create", "basic");
      return;
    }

    const viewCustomerButton = event.target.closest("[data-customer-management-view]");
    if (viewCustomerButton) {
      openCustomerManagementDrawer(viewCustomerButton.dataset.customerManagementView, "view", "basic");
      return;
    }

    const editCustomerButton = event.target.closest("[data-customer-management-edit]");
    if (editCustomerButton) {
      openCustomerManagementDrawer(editCustomerButton.dataset.customerManagementEdit, "edit", "basic");
      return;
    }

    const customerTabButton = event.target.closest("[data-customer-drawer-tab]");
    if (customerTabButton) {
      setCustomerDrawerTab(customerTabButton.dataset.customerDrawerTab);
      return;
    }

    const passwordGenerateButton = event.target.closest("[data-generate-temp-password]");
    if (passwordGenerateButton) {
      generateCustomerTemporaryPassword();
      return;
    }

    const passwordCopyButton = event.target.closest("[data-copy-temp-password]");
    if (passwordCopyButton) {
      copyCustomerTemporaryPassword();
      return;
    }

    const passwordToggleButton = event.target.closest("[data-toggle-temp-password]");
    if (passwordToggleButton) {
      toggleCustomerTemporaryPasswordVisibility();
      return;
    }

    const toggleCustomerButton = event.target.closest("[data-toggle-customer-status]");
    if (toggleCustomerButton) {
      toggleCustomerStatus(toggleCustomerButton.dataset.toggleCustomerStatus);
      return;
    }

    const deleteCustomerButton = event.target.closest("[data-delete-customer]");
    if (deleteCustomerButton) {
      deleteCustomerAccount(deleteCustomerButton.dataset.deleteCustomer);
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

  document.addEventListener("input", (event) => {
    const search = event.target.closest("[data-customer-quote-search]");
    if (search) {
      updateCustomerQuoteDetailsSearch(search.dataset.customerQuoteSearch, search.value);
    }
    const adminSearch = event.target.closest("[data-admin-quote-search]");
    if (adminSearch) {
      updateAdminQuoteDetailsSearch(adminSearch.dataset.adminQuoteSearch, adminSearch.value);
    }
    const customerSearch = event.target.closest("[data-customer-management-query]");
    if (customerSearch) {
      state.customerManagement.query = customerSearch.value;
      renderCustomerManagementList();
      return;
    }
    const drawerInput = event.target.closest("[data-customer-drawer-field]");
    if (drawerInput) {
      markCustomerManagementSectionDirty(customerManagementSectionForField(drawerInput));
      captureCustomerManagementDraft();
      if (drawerInput.name === "portalEmail") {
        syncCustomerPortalStatus();
      }
    }
    if (event.target.closest("#customerPricingForm")) {
      updateCustomerPricingPreview();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target?.id === "staffSearchInput") {
      event.preventDefault();
      runStaffSearch();
    }
  });

  document.addEventListener("change", (event) => {
    const sort = event.target.closest("[data-customer-quote-sort]");
    if (sort) {
      updateCustomerQuoteDetailsSort(sort.dataset.customerQuoteSort, sort.value);
    }
    const adminSort = event.target.closest("[data-admin-quote-sort]");
    if (adminSort) {
      updateAdminQuoteDetailsSort(adminSort.dataset.adminQuoteSort, adminSort.value);
    }
    const adminSource = event.target.closest("[data-admin-quote-source-filter]");
    if (adminSource) {
      updateAdminQuoteDetailsSourceFilter(adminSource.dataset.adminQuoteSourceFilter, adminSource.value);
    }
    const adminBookable = event.target.closest("[data-admin-quote-bookable-only]");
    if (adminBookable) {
      updateAdminQuoteDetailsBookableOnly(adminBookable.dataset.adminQuoteBookableOnly, adminBookable.checked);
    }
    const staffRange = event.target.closest("[data-staff-dashboard-range]");
    if (staffRange) {
      state.staffDashboardRange = staffRange.value || "last7";
      renderDashboard();
    }
    const customerManagementFilter = event.target.closest("[data-customer-management-filter]");
    if (customerManagementFilter) {
      state.customerManagement[customerManagementFilter.dataset.customerManagementFilter] = customerManagementFilter.value;
      renderCustomerManagementList();
      return;
    }
    const drawerField = event.target.closest("[data-customer-drawer-field]");
    if (drawerField) {
      markCustomerManagementSectionDirty(customerManagementSectionForField(drawerField));
      captureCustomerManagementDraft();
      if (drawerField.name === "portalEmail") {
        syncCustomerPortalStatus();
      }
    }
    const pricingRuleType = event.target.closest("#customerPricingForm [name='ruleType']");
    if (pricingRuleType) {
      captureCustomerManagementDraft();
      renderCustomerManagementDrawer();
      return;
    }
    const quoteMode = event.target.closest("[data-customer-mode-quote]");
    if (quoteMode) {
      handleCustomerModeQuoteChange(quoteMode);
      return;
    }
    const bookingMode = event.target.closest("[data-customer-mode-booking]");
    if (bookingMode) {
      handleCustomerModeBookingChange(bookingMode);
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target?.id === "customerBasicForm") {
      event.preventDefault();
      saveCustomerBasicForm(event.target);
    } else if (event.target?.id === "customerPricingForm") {
      event.preventDefault();
      saveCustomerPricingForm(event.target);
    } else if (event.target?.id === "customerPortalForm") {
      event.preventDefault();
      saveCustomerPortalForm(event.target);
    } else if (event.target?.id === "customerBlockedCarrierForm") {
      event.preventDefault();
      saveCustomerBlockedCarrierForm(event.target);
    }
  });

  document.getElementById("customerForm")?.addEventListener("submit", async (event) => {
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

  document.getElementById("tariffForm")?.addEventListener("submit", async (event) => {
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

  document.getElementById("carrierPreferenceForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isStaffUser()) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const customerId = form.get("customerId");
    await api("/api/carrier-preferences", {
      method: "POST",
      body: {
        customerId,
        carrierKey: form.get("carrierKey"),
        carrierName: form.get("carrierName") || form.get("carrierKey"),
        preference: "blocked",
        reason: form.get("reason")
      }
    });
    event.currentTarget.reset();
    const select = document.getElementById("carrierPreferenceCustomerSelect");
    if (select) {
      select.value = customerId;
    }
    showToast(t("Blocked carrier added."));
    await refreshCarrierPreferences();
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
    const intakeParseButton = event.target.closest("[data-quote-intake-parse]");
    if (intakeParseButton) {
      parseQuoteIntakeFromForm();
      return;
    }
    const intakeApplyButton = event.target.closest("[data-quote-intake-apply]");
    if (intakeApplyButton) {
      applyQuoteIntakeToForm();
      return;
    }
    const intakeClearButton = event.target.closest("[data-quote-intake-clear]");
    if (intakeClearButton) {
      clearQuoteIntake();
      return;
    }

    const saveAddressButton = event.target.closest("[data-save-address]");
    if (saveAddressButton) {
      saveCurrentAddress(saveAddressButton.dataset.saveAddress);
      return;
    }
    const updateAddressButton = event.target.closest("[data-update-address]");
    if (updateAddressButton) {
      updateSavedAddress(updateAddressButton.dataset.updateAddress);
      return;
    }
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
  wireAddressBookControls();
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

function bindDashboardModalButtons(root = document) {
  root.querySelectorAll("[data-modal]").forEach((button) => {
    if (button.dataset.modalBound === "true") {
      return;
    }
    button.addEventListener("click", () => openDashboardModal(button.dataset.modal));
    button.dataset.modalBound = "true";
  });
}

async function refreshAll(options = {}) {
  const refreshButton = document.getElementById("refreshButton");
  state.dashboardLoading = true;
  state.dashboardError = "";
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.textContent = t("Refreshing...");
    refreshButton.setAttribute("aria-busy", "true");
  }
  renderDashboard();
  try {
    const selectedQuoteCustomerId = document.getElementById("quoteCustomerSelect")?.value || "";
    const addressBookRequest = isStaffUser() && !selectedQuoteCustomerId
      ? Promise.resolve({ entries: [] })
      : api(`/api/address-book${isStaffUser() ? `?customerId=${encodeURIComponent(selectedQuoteCustomerId)}` : ""}`);
    const [health, customers, tariffs, addressBook, quotes, shipments, invoices] = await Promise.all([
      api("/api/health"),
      api("/api/customers"),
      api("/api/tariffs"),
      addressBookRequest,
      api("/api/quotes"),
      api("/api/shipments"),
      api("/api/invoices")
    ]);

    state.health = health;
    state.customers = customers.customers;
    if (state.customerManagement.selectedCustomerId && !state.customers.some((customer) => customer.id === state.customerManagement.selectedCustomerId)) {
      state.customerManagement.selectedCustomerId = "";
      state.customerManagement.drawerMode = "";
      state.customerManagement.drawerTab = "basic";
      resetCustomerManagementDraft();
    }
    state.tariffs = tariffs.tariffRules;
    state.addressBookEntries = addressBook.entries || [];
    state.quotes = quotes.quotes;
    state.shipments = shipments.shipments;
    state.invoices = invoices.invoices;
    state.lastSuccessfulRefreshAt = new Date().toISOString();
    if (state.modal?.type === "customerManagement") {
      if (state.customerManagement.drawerMode === "view") {
        initializeCustomerManagementDraft(selectedCustomer());
      } else {
        mergeCustomerManagementDraftFromCurrentPersisted(selectedCustomer());
      }
    }

    renderHealth();
    renderUserChip();
    renderCustomerOptions();
    await refreshCarrierPreferences({ silent: true });
    renderAddressBookControls();
    renderCustomers();
    renderQuotesView();
    renderDashboard();
    renderShipments();
    renderInvoices();
    if (!(state.modal?.type === "customerManagement" && hasCustomerManagementUnsavedChanges())) {
      renderModal();
    }
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
    state.dashboardError = t("Dashboard data could not be refreshed. Please try again.");
    renderDashboard();
    showToast(error.message, true);
  } finally {
    state.dashboardLoading = false;
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = t("Refresh");
      refreshButton.setAttribute("aria-busy", "false");
    }
    renderDashboard();
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

function setView(name, options = {}) {
  const activeView = document.querySelector(".nav-button.active")?.dataset.view || "";
  if (activeView === "customers" && name !== "customers" && hasCustomerManagementUnsavedChanges()) {
    if (!window.confirm(t("Unsaved changes will be lost. Continue?"))) {
      return;
    }
    resetCustomerManagementDraft();
  }
  if (options.resetCustomerFilter) {
    resetCustomerFilterForView(name);
    resetStaffFilterForView(name);
  }
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
  updateRolePresentation();
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", !isStaff);
  });
  document.querySelectorAll(".customer-only").forEach((element) => {
    element.classList.toggle("hidden", !isCustomer);
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
      refreshAll({ keepQuoteResults: true });
    });
    quoteCustomerSelect.dataset.autofillBound = "true";
  }
  if (!isStaff && document.querySelector(".nav-button.active")?.dataset.view === "customers") {
    setView("dashboard");
  }
  const portalSubtitle = document.getElementById("portalSubtitle");
  if (portalSubtitle) {
    portalSubtitle.textContent = isCustomer ? t("Customer Portal") : t("Operations portal");
  }
  renderCarrierPreferences();
  renderUserChip();
  renderDashboardSupportPanel();
}

function updateRolePresentation() {
  const isCustomer = isCustomerUser();
  const appShell = document.getElementById("appShell");
  if (appShell) {
    appShell.classList.toggle("customer-session", isCustomer);
    appShell.classList.toggle("staff-session", Boolean(state.user) && !isCustomer);
  }
  const labels = {
    dashboard: "Dashboard",
    customers: isCustomer ? "Customers" : "Customer Management",
    quotes: isCustomer ? "My Quotes" : "Quote Management",
    quote: "New Quote",
    shipments: isCustomer ? "My Shipments" : "Shipment Management",
    invoices: isCustomer ? "My Invoices" : "Invoice Management"
  };
  Object.entries(labels).forEach(([view, label]) => {
    const button = document.querySelector(`.nav-button[data-view="${view}"]`);
    if (button) {
      button.textContent = t(label);
    }
  });
  const refreshButton = document.getElementById("refreshButton");
  if (refreshButton) {
    refreshButton.classList.toggle("primary-action", false);
    refreshButton.classList.toggle("secondary-action", true);
    refreshButton.classList.toggle("refresh-action", isCustomer);
  }
}

function isStaffUser() {
  return ["admin", "operations", "staff"].includes(state.user?.role);
}

function isCustomerUser() {
  return state.user?.role === "customer";
}

function customerPriceLabel() {
  return isCustomerUser() ? t("Your Price") : t("Sell price");
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

function rateBookingAllowedForUser(quote, rate) {
  if (!isCustomerUser()) {
    return true;
  }
  const status = normalizeQuoteStatus(quote?.status);
  if (["expired", "cancelled", "failed", "booked"].includes(status) || quoteHasShipment(quote, state.shipments)) {
    return false;
  }
  if (!Number.isFinite(validSellPrice(rate))) {
    return false;
  }
  if (rate?.bookingAllowed === false) {
    return false;
  }
  return customerBookingAllowed(quote?.customerId, rate?.carrierSource || quote?.carrierMode);
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
  const sidebarHealth = document.getElementById("sidebarHealthStatus");
  const loginDot = document.getElementById("loginStatusDot");
  const loginHealthText = document.getElementById("loginHealthText");

  if (dot) {
    dot.classList.toggle("ready", Boolean(state.health?.ok));
  }
  if (loginDot) {
    loginDot.classList.toggle("ready", Boolean(state.health?.ok));
  }

  const message = state.health?.ok ? t("Server ready") : t("Checking server");
  if (sidebarHealth) {
    sidebarHealth.classList.toggle("hidden", Boolean(state.user && isCustomerUser() && state.health?.ok));
  }
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

  if (isCustomerUser()) {
    const customer = currentCustomer();
    const identifier = state.user.email || state.user.username || state.user.name || "";
    chip.innerHTML = `
      <strong>${escapeHtml(customer?.companyName || t("Your account"))}</strong>
      <small>${escapeHtml(identifier)}</small>
    `;
    return;
  }

  const identifier = state.user.name || state.user.displayName || state.user.email || state.user.username || t("Account");
  chip.innerHTML = `
    <button class="staff-account-chip" type="button" aria-haspopup="menu">
      <span>${escapeHtml(identifier)}</span>
      <small>${escapeHtml(t("Administrator / Staff"))}</small>
    </button>
    <div class="staff-account-menu" role="menu" aria-label="${escapeHtml(t("Account"))}">
      <button type="button" role="menuitem">${escapeHtml(t("Account"))}</button>
      <button type="button" role="menuitem">${escapeHtml(t("System status"))}</button>
      <button type="button" role="menuitem" onclick="document.getElementById('logoutButton')?.click()">${escapeHtml(t("Logout"))}</button>
    </div>
  `;
}

async function logout() {
  await api("/api/logout", {
    method: "POST"
  });
  state.user = null;
  state.currentQuote = null;
  resetCustomerManagementDraft();
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
    if (event.key === "Enter" && event.target?.id === "trackShipmentSearchInput") {
      event.preventDefault();
      runTrackShipmentSearch();
      return;
    }
    if (event.key === "Escape") {
      closeModal();
    }
  });
}

function openModal(title, bodyHtml, options = {}) {
  const overlay = document.getElementById("modalOverlay");
  const replacingOpenModal = overlay && !overlay.classList.contains("hidden");
  if (!replacingOpenModal || !state.lastModalFocus || !document.contains(state.lastModalFocus)) {
    state.lastModalFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  state.modal = { type: "static", title, bodyHtml, modalClass: options.modalClass || "" };
  paintModal(title, bodyHtml);
}

function paintModal(title, bodyHtml) {
  const overlay = document.getElementById("modalOverlay");
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = bodyHtml;
  overlay.classList.toggle("customer-quote-details-modal", state.modal?.modalClass === "customer-quote-details-modal");
  overlay.classList.toggle("admin-quote-details-modal", state.modal?.modalClass === "admin-quote-details-modal");
  overlay.classList.toggle("customer-management-drawer-modal", state.modal?.modalClass === "customer-management-drawer-modal");
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
}

function closeModal(options = {}) {
  if (!options.force && state.modal?.modalClass === "customer-management-drawer-modal" && hasCustomerManagementUnsavedChanges()) {
    if (!window.confirm(t("Unsaved changes will be lost. Continue?"))) {
      return false;
    }
  }
  const wasCustomerManagementDrawer = state.modal?.modalClass === "customer-management-drawer-modal";
  const overlay = document.getElementById("modalOverlay");
  overlay.classList.add("hidden");
  overlay.classList.remove("customer-quote-details-modal");
  overlay.classList.remove("admin-quote-details-modal");
  overlay.classList.remove("customer-management-drawer-modal");
  overlay.setAttribute("aria-hidden", "true");
  document.getElementById("modalBody").innerHTML = "";
  state.modal = null;
  state.pendingBooking = null;
  resetAdminQuoteDetailsControls("");
  if (wasCustomerManagementDrawer) {
    resetCustomerManagementDraft();
  } else {
    clearCustomerTemporaryPassword();
  }
  if (state.lastModalFocus && document.contains(state.lastModalFocus)) {
    state.lastModalFocus.focus();
  }
  state.lastModalFocus = null;
  return true;
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

  if (state.modal.type === "customerManagement") {
    paintModal(customerManagementDrawerTitle(), customerManagementDrawerHtml());
    afterRenderCustomerManagementDrawer();
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

  if (isCustomerUser()) {
    resetCustomerQuoteDetailsControls(quoteId);
    openModal(t("Quote Details"), renderCustomerQuoteDetailsShell(quote), { modalClass: "customer-quote-details-modal" });
    updateCustomerQuoteRateResults(quoteId);
    return;
  }
  resetAdminQuoteDetailsControls(quoteId);
  openModal(t("Quote Details"), adminQuoteDetailsHtml(quote), { modalClass: "admin-quote-details-modal" });
  updateAdminQuoteRateResults(quoteId);
}

function resetCustomerQuoteDetailsControls(quoteId) {
  state.customerQuoteDetails = {
    quoteId,
    visibleCount: 12,
    sort: "lowestPrice",
    search: ""
  };
}

function updateCustomerQuoteDetailsSort(quoteId, sort) {
  if (!isCustomerUser() || state.customerQuoteDetails.quoteId !== quoteId) {
    return;
  }
  state.customerQuoteDetails.sort = ["lowestPrice", "fastestTransit", "earliestEta"].includes(sort) ? sort : "lowestPrice";
  state.customerQuoteDetails.visibleCount = 12;
  updateCustomerQuoteRateResults(quoteId);
}

function updateCustomerQuoteDetailsSearch(quoteId, search) {
  if (!isCustomerUser() || state.customerQuoteDetails.quoteId !== quoteId) {
    return;
  }
  state.customerQuoteDetails.search = String(search || "");
  state.customerQuoteDetails.visibleCount = 12;
  updateCustomerQuoteRateResults(quoteId);
}

function loadMoreCustomerQuoteDetailsRates(quoteId) {
  if (!isCustomerUser() || state.customerQuoteDetails.quoteId !== quoteId) {
    return;
  }
  const quote = state.quotes.find((item) => item.id === quoteId);
  const total = customerQuoteRateCollections(quote).sortedFilteredRates.length;
  state.customerQuoteDetails.visibleCount = Math.min((state.customerQuoteDetails.visibleCount || 12) + 12, total);
  updateCustomerQuoteRateResults(quoteId);
}

function updateCustomerQuoteRateResults(quoteId) {
  const quote = state.quotes.find((item) => item.id === quoteId);
  if (!quote || !state.modal || state.modal.title !== t("Quote Details")) {
    return;
  }
  const rendered = renderCustomerQuoteRateResults(quote);
  const escapedQuoteId = cssAttributeEscape(quoteId);
  const count = document.querySelector(`[data-customer-quote-rate-count="${escapedQuoteId}"]`);
  const list = document.querySelector(`[data-customer-quote-rate-list="${escapedQuoteId}"]`);
  const footer = document.querySelector(`[data-customer-quote-rate-footer="${escapedQuoteId}"]`);
  if (count) {
    count.textContent = rendered.countText;
  }
  if (list) {
    list.innerHTML = rendered.listHtml;
  }
  if (footer) {
    footer.innerHTML = rendered.footerHtml;
  }
}

function resetAdminQuoteDetailsControls(quoteId) {
  state.adminQuoteDetails = {
    quoteId,
    search: "",
    sort: "customerPrice",
    sourceFilter: "all",
    bookableOnly: false,
    visibleCount: 20,
    diagnosticsOpen: false
  };
}

function adminQuoteDetailsControls(quoteId) {
  if (state.adminQuoteDetails.quoteId !== quoteId) {
    resetAdminQuoteDetailsControls(quoteId);
  }
  return state.adminQuoteDetails;
}

function updateAdminQuoteDetailsSearch(quoteId, search) {
  if (isCustomerUser() || state.adminQuoteDetails.quoteId !== quoteId) {
    return;
  }
  state.adminQuoteDetails.search = String(search || "");
  state.adminQuoteDetails.visibleCount = 20;
  updateAdminQuoteRateResults(quoteId);
}

function updateAdminQuoteDetailsSort(quoteId, sort) {
  if (isCustomerUser() || state.adminQuoteDetails.quoteId !== quoteId) {
    return;
  }
  state.adminQuoteDetails.sort = ["customerPrice", "carrierCost", "grossProfit", "margin", "transit", "eta", "carrierName"].includes(sort) ? sort : "customerPrice";
  state.adminQuoteDetails.visibleCount = 20;
  updateAdminQuoteRateResults(quoteId);
}

function updateAdminQuoteDetailsSourceFilter(quoteId, sourceFilter) {
  if (isCustomerUser() || state.adminQuoteDetails.quoteId !== quoteId) {
    return;
  }
  state.adminQuoteDetails.sourceFilter = normalizeCarrierModeValue(sourceFilter || "all");
  state.adminQuoteDetails.visibleCount = 20;
  updateAdminQuoteRateResults(quoteId);
}

function updateAdminQuoteDetailsBookableOnly(quoteId, checked) {
  if (isCustomerUser() || state.adminQuoteDetails.quoteId !== quoteId) {
    return;
  }
  state.adminQuoteDetails.bookableOnly = Boolean(checked);
  state.adminQuoteDetails.visibleCount = 20;
  updateAdminQuoteRateResults(quoteId);
}

function loadMoreAdminQuoteDetailsRates(quoteId) {
  if (isCustomerUser() || state.adminQuoteDetails.quoteId !== quoteId) {
    return;
  }
  const quote = state.quotes.find((item) => item.id === quoteId);
  const total = adminQuoteRateCollections(quote).sortedFilteredRows.length;
  state.adminQuoteDetails.visibleCount = Math.min((state.adminQuoteDetails.visibleCount || 20) + 20, total);
  updateAdminQuoteRateResults(quoteId);
}

function updateAdminQuoteRateResults(quoteId) {
  const quote = state.quotes.find((item) => item.id === quoteId);
  if (!quote || !state.modal || state.modal.title !== t("Quote Details")) {
    return;
  }
  const rendered = renderAdminQuoteRateResults(quote);
  const escapedQuoteId = cssAttributeEscape(quoteId);
  const count = document.querySelector(`[data-admin-quote-rate-count="${escapedQuoteId}"]`);
  const list = document.querySelector(`[data-admin-quote-rate-list="${escapedQuoteId}"]`);
  const footer = document.querySelector(`[data-admin-quote-rate-footer="${escapedQuoteId}"]`);
  if (count) {
    count.textContent = rendered.countText;
  }
  if (list) {
    list.innerHTML = rendered.listHtml;
  }
  if (footer) {
    footer.innerHTML = rendered.footerHtml;
  }
}

function cssAttributeEscape(value) {
  const text = String(value || "");
  if (window.CSS?.escape) {
    return CSS.escape(text);
  }
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
  const quote = state.currentQuote?.id === quoteId ? state.currentQuote : state.quotes.find((item) => item.id === quoteId);
  if (!quote) {
    return;
  }

  const rate = Array.isArray(quote.rates)
    ? quote.rates.find((item) => item.id === rateId || (!item.id && item.carrierRateId === rateId))
    : null;
  if (!rate) {
    return;
  }

  if (isCustomerUser() && !rateBookingAllowedForUser(quote, rate)) {
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

  const quote = state.currentQuote?.id === pending.quoteId ? state.currentQuote : state.quotes.find((item) => item.id === pending.quoteId);
  if (!quote) {
    cancelPendingBooking();
    return;
  }

  const rate = Array.isArray(quote.rates)
    ? quote.rates.find((item) => item.id === pending.rateId || (!item.id && item.carrierRateId === pending.rateId))
    : null;
  if (!rate) {
    cancelPendingBooking();
    return;
  }

  const purchaseSummary = summarizeMothershipPurchaseMetadata(mothershipPurchaseMetadata(quote, rate));
  if (purchaseSummary && purchaseSummary.purchasable === false) {
    cancelPendingBooking();
    showToast(isCustomerUser()
      ? t("This rate cannot be booked online. Please choose another rate or contact customer service.")
      : (purchaseSummary.invalidFields.length > 0 ? `Mothership needs: ${purchaseSummary.invalidFields.join("; ")}` : t("This Mothership quote is not purchasable yet.")),
    true);
    return;
  }

  if (isCustomerUser() && !rateBookingAllowedForUser(quote, rate)) {
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
  openCustomerManagementDrawer(customerId, "edit", "basic");
}

function openCustomerManagementDrawer(customerId = "", mode = "edit", tab = "basic") {
  if (!isStaffUser()) {
    return;
  }
  if (hasCustomerManagementUnsavedChanges() && state.modal?.modalClass === "customer-management-drawer-modal" && !window.confirm(t("Unsaved changes will be lost. Continue?"))) {
    return;
  }
  resetCustomerManagementDraft();
  state.customerManagement.selectedCustomerId = customerId;
  state.customerManagement.drawerMode = mode;
  state.customerManagement.drawerTab = tab;
  state.customerManagement.error = "";
  initializeCustomerManagementDraft(customerId ? state.customers.find((customer) => customer.id === customerId) : null);
  state.modal = {
    type: "customerManagement",
    modalClass: "customer-management-drawer-modal"
  };
  renderModal();
  if (customerId) {
    refreshCarrierPreferences({ silent: true });
  } else {
    state.carrierPreferences = [];
  }
}

function customerManagementDrawerTitle() {
  const customer = selectedCustomer();
  if (state.customerManagement.drawerMode === "create") {
    return t("+ Add Customer");
  }
  return `${t("Customer Management")}: ${customer?.companyName || t("No customer selected.")}`;
}

function customerManagementDrawerHtml() {
  if (!isStaffUser()) {
    return `<div class="empty-state">${escapeHtml(t("Customer management is available to staff users only."))}</div>`;
  }
  const customer = selectedCustomer();
  const isCreate = state.customerManagement.drawerMode === "create";
  const isView = state.customerManagement.drawerMode === "view";
  const title = isCreate ? t("+ Add Customer") : customer?.companyName || t("No customer selected.");
  const subtitle = isCreate ? t("Enter the customer's basic information and optional portal access.") : customerAddressLine(customer);
  const tabs = [
    ["basic", "Basic Information"],
    ["pricing", "Pricing & Channels"],
    ["blocked", "Blocked Carriers"],
    ["portal", "Customer Portal"]
  ];
  const unavailableTabMessage = t("Enter the customer's basic information and optional portal access.");
  return `
    <div class="customer-drawer" data-customer-management-drawer>
      <header class="customer-drawer-header">
        <div>
          <small>${escapeHtml(t("Customer Management"))}</small>
          <h2>${escapeHtml(title)}</h2>
          ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
        </div>
        ${isView && customer?.id ? `<button class="secondary-action" type="button" data-customer-management-edit="${escapeHtml(customer.id)}">${escapeHtml(t("Edit"))}</button>` : ""}
      </header>
      <nav class="customer-drawer-tabs" aria-label="${escapeHtml(t("Customer Management"))}">
        ${tabs.map(([key, label]) => {
          const disabled = isCustomerManagementTabDisabled({ drawerMode: state.customerManagement.drawerMode, tab: key });
          const unsaved = !isView && isCustomerManagementSectionDirty(key);
          const tabLabel = unsaved ? `${t(label)} · ${t("Unsaved")}` : t(label);
          return `<button type="button" class="${state.customerManagement.drawerTab === key ? "active" : ""}" data-customer-drawer-tab="${escapeHtml(key)}" ${disabled ? `disabled aria-label="${escapeHtml(`${tabLabel}. ${unavailableTabMessage}`)}" title="${escapeHtml(unavailableTabMessage)}"` : `aria-label="${escapeHtml(tabLabel)}"`}>${escapeHtml(tabLabel)}</button>`;
        }).join("")}
      </nav>
      ${state.customerManagement.error ? `<div class="form-error">${escapeHtml(state.customerManagement.error)}</div>` : ""}
      <section class="customer-drawer-body">
        ${customerDrawerTabHtml(customer)}
      </section>
    </div>
  `;
}

function customerDrawerTabHtml(customer) {
  const tab = state.customerManagement.drawerTab;
  if (tab === "pricing") return customerPricingDrawerHtml(customer);
  if (tab === "blocked") return customerBlockedCarriersDrawerHtml(customer);
  if (tab === "portal") return customerPortalDrawerHtml(customer);
  return customerBasicDrawerHtml(customer);
}

function customerBasicDrawerHtml(customer = {}) {
  const isCreate = state.customerManagement.drawerMode === "create";
  const isView = state.customerManagement.drawerMode === "view";
  const draft = state.customerManagement.draft.basic || {};
  const readOnlyAttr = isView ? "readonly" : "";
  const disabledAttr = isView ? "disabled" : "";
  return `
    <form id="customerBasicForm" class="customer-drawer-form form-grid compact">
      <label>
        <span>${escapeHtml(t("Company name"))}</span>
        <input data-customer-drawer-field name="companyName" required ${readOnlyAttr} value="${escapeHtml(draft.companyName || "")}">
      </label>
      <label>
        <span>${escapeHtml(t("Billing email"))}</span>
        <input data-customer-drawer-field name="billingEmail" type="email" ${readOnlyAttr} value="${escapeHtml(draft.billingEmail || "")}">
      </label>
      <label>
        <span>${escapeHtml(t("Payment terms"))}</span>
        <input data-customer-drawer-field name="paymentTerms" ${readOnlyAttr} value="${escapeHtml(draft.paymentTerms || "Net 15")}">
      </label>
      <label>
        <span>${escapeHtml(t("Company phone"))}</span>
        <input data-customer-drawer-field name="companyPhone" type="tel" inputmode="numeric" autocomplete="tel" ${readOnlyAttr} value="${escapeHtml(draft.companyPhone || "")}">
      </label>
      <label class="span-2">
        <span>${escapeHtml(t("Company street"))}</span>
        <input data-customer-drawer-field name="companyStreet" ${readOnlyAttr} value="${escapeHtml(draft.companyStreet || "")}">
      </label>
      <label>
        <span>${escapeHtml(t("Company city"))}</span>
        <input data-customer-drawer-field name="companyCity" ${readOnlyAttr} value="${escapeHtml(draft.companyCity || "")}">
      </label>
      <label>
        <span>${escapeHtml(t("Company state"))}</span>
        <input data-customer-drawer-field name="companyState" maxlength="2" ${readOnlyAttr} value="${escapeHtml(draft.companyState || "")}">
      </label>
      <label>
        <span>${escapeHtml(t("Company ZIP"))}</span>
        <input data-customer-drawer-field name="companyZip" data-zip-autofill="company" ${readOnlyAttr} value="${escapeHtml(draft.companyZip || "")}">
      </label>
      <label>
        <span>${escapeHtml(t("business.openingTime"))}</span>
        <select data-customer-drawer-field name="companyOpenTime" data-time-select ${disabledAttr}><option value="">${escapeHtml(t("Select time"))}</option></select>
      </label>
      <label>
        <span>${escapeHtml(t("business.closingTime"))}</span>
        <select data-customer-drawer-field name="companyCloseTime" data-time-select ${disabledAttr}><option value="">${escapeHtml(t("Select time"))}</option></select>
      </label>
      <label>
        <span>${escapeHtml(t("Account status"))}</span>
        <select data-customer-drawer-field name="status" ${disabledAttr}>
          <option value="active" ${normalizeCustomerAccountStatus(draft.status) === "active" ? "selected" : ""}>${escapeHtml(t("account.status.active"))}</option>
          <option value="disabled" ${normalizeCustomerAccountStatus(draft.status) === "disabled" ? "selected" : ""}>${escapeHtml(t("account.status.disabled"))}</option>
        </select>
      </label>
      ${isCreate ? customerPortalFieldsHtml(customer) : ""}
      ${isView ? "" : `<div class="modal-actions span-2">
        <button class="primary-action" type="submit" ${state.customerManagement.saving === "basic" ? "disabled" : ""}>${escapeHtml(state.customerManagement.saving === "basic" ? t("Customer save in progress...") : t(isCreate ? "Add Customer" : "Save basic information"))}</button>
      </div>`}
    </form>
  `;
}

function customerPricingDrawerHtml(customer = selectedCustomer()) {
  if (!customer?.id) return `<div class="empty-state">${escapeHtml(t("No customer selected."))}</div>`;
  const isView = state.customerManagement.drawerMode === "view";
  const draft = state.customerManagement.draft.pricing || {};
  const ruleType = draft.ruleType === "fixed" ? "fixed" : "percentage";
  const disabledAttr = isView ? "disabled" : "";
  return `
    <form id="customerPricingForm" class="customer-drawer-form">
      <div class="form-grid compact">
        <label>
          <span>${escapeHtml(t("Rule type"))}</span>
          <select data-customer-drawer-field name="ruleType" ${disabledAttr}>
            <option value="fixed" ${ruleType === "fixed" ? "selected" : ""}>${escapeHtml(t("Fixed markup"))}</option>
            <option value="percentage" ${ruleType === "percentage" ? "selected" : ""}>${escapeHtml(t("Percentage markup"))}</option>
          </select>
        </label>
        ${ruleType === "fixed" ? `
          <label>
            <span>${escapeHtml(t("Fixed amount"))}</span>
            <input data-customer-drawer-field name="fixedAmount" type="number" min="0" step="0.01" ${isView ? "readonly" : ""} value="${escapeHtml(String(draft.fixedAmount ?? 50))}">
          </label>
        ` : `
          <label>
            <span>${escapeHtml(t("Markup percentage"))}</span>
            <input data-customer-drawer-field name="markupPercentage" type="number" min="0" step="0.1" ${isView ? "readonly" : ""} value="${escapeHtml(String(draft.markupPercentage ?? 15))}">
          </label>
        `}
      </div>
      <div class="pricing-preview" id="customerPricingPreview">${pricingPreviewHtml(ruleType, draft)}</div>
      <p class="helper-text">${escapeHtml(t("This rule changes the customer quote price and does not change carrier cost."))}</p>
      <div class="carrier-mode-matrix">
        <div class="carrier-mode-matrix-head">
          <strong>${escapeHtml(t("Carrier Channel"))}</strong>
          <strong>${escapeHtml(t("Get Rates"))}</strong>
          <strong>${escapeHtml(t("customerManagement.onlineBooking"))}</strong>
        </div>
        ${carrierModeMatrixHtml(customer)}
      </div>
      <p class="helper-text">${escapeHtml(t("Online booking can only be enabled for channels that are enabled for quoting."))}</p>
      <div id="customerPricingFormError" class="form-error"></div>
      ${isView ? "" : `<div class="modal-actions">
        <button class="primary-action" type="submit" ${state.customerManagement.saving === "pricing" ? "disabled" : ""}>${escapeHtml(state.customerManagement.saving === "pricing" ? t("Tariff save in progress...") : t("Save pricing for {name}", { name: customer.companyName }))}</button>
      </div>`}
    </form>
  `;
}

function carrierModeMatrixHtml(customer) {
  const isView = state.customerManagement.drawerMode === "view";
  const draft = state.customerManagement.draft.carrierModes || {};
  return carrierModeMatrixRows({
    ...customer,
    allowedCarrierModes: draft.allowedCarrierModes || [],
    allowedBookingCarrierModes: draft.allowedBookingCarrierModes || [],
    allowedBooking: (draft.allowedBookingCarrierModes || []).length > 0
  }, { showDemo: true })
    .map((row) => `
      <div class="carrier-mode-row ${row.isDemo ? "is-demo" : ""}">
        <div>
          <strong>${escapeHtml(t(row.label))}</strong>
          ${row.isDemo ? `<small>${escapeHtml(t("Demo Rates is for internal testing only."))}</small>` : ""}
        </div>
        <label class="checkbox-wrap">
          <input data-customer-drawer-field data-customer-mode-quote type="checkbox" value="${escapeHtml(row.key)}" ${row.quotingEnabled ? "checked" : ""} ${isView ? "disabled" : ""}>
          <span>${escapeHtml(t("Get Rates"))}</span>
        </label>
        <label class="checkbox-wrap">
          <input data-customer-drawer-field data-customer-mode-booking type="checkbox" value="${escapeHtml(row.key)}" ${row.bookingEnabled ? "checked" : ""} ${row.bookingAllowed && !isView ? "" : "disabled"}>
          <span>${escapeHtml(t("customerManagement.onlineBooking"))}</span>
        </label>
      </div>
    `).join("");
}

function customerBlockedCarriersDrawerHtml(customer = selectedCustomer()) {
  if (!customer?.id) return `<div class="empty-state">${escapeHtml(t("No customer selected."))}</div>`;
  const isView = state.customerManagement.drawerMode === "view";
  const draft = state.customerManagement.draft.blocked || {};
  const saving = state.customerManagement.saving === "blocked";
  return `
    ${isView ? "" : `
    <form id="customerBlockedCarrierForm" class="form-grid compact customer-drawer-form">
      <label>
        <span>${escapeHtml(t("Carrier code or name"))}</span>
        <input data-customer-drawer-field name="carrierKey" required placeholder="XPOL or XPO Logistics" value="${escapeHtml(draft.carrierKey || "")}">
      </label>
      <label>
        <span>${escapeHtml(t("Display name"))}</span>
        <input data-customer-drawer-field name="carrierName" placeholder="XPO Logistics" value="${escapeHtml(draft.carrierName || "")}">
      </label>
      <label class="span-2">
        <span>${escapeHtml(t("Reason"))}</span>
        <input data-customer-drawer-field name="reason" placeholder="${escapeHtml(t("Optional internal reason"))}" value="${escapeHtml(draft.reason || "")}">
      </label>
      <div class="modal-actions span-2">
        <button class="primary-action" type="submit" ${saving ? "disabled" : ""}>${escapeHtml(saving ? t("Blocking carrier...") : t("Block Carrier"))}</button>
      </div>
    </form>`}
    <div id="carrierPreferenceList" class="blocked-carrier-list"></div>
  `;
}

function customerPortalDrawerHtml(customer = selectedCustomer()) {
  if (!customer?.id) return `<div class="empty-state">${escapeHtml(t("No customer selected."))}</div>`;
  const isView = state.customerManagement.drawerMode === "view";
  return `
    <form id="customerPortalForm" class="customer-drawer-form form-grid compact">
      ${customerPortalFieldsHtml(customer)}
      <p class="helper-text span-2">${escapeHtml(t("Leave blank to keep the existing password."))}</p>
      ${isView ? "" : `<div class="modal-actions span-2">
        <button class="primary-action" type="submit" ${state.customerManagement.saving === "portal" ? "disabled" : ""}>${escapeHtml(t("Save portal access"))}</button>
      </div>`}
    </form>
  `;
}

function customerPortalFieldsHtml(customer = {}) {
  const isView = state.customerManagement.drawerMode === "view";
  const draft = state.customerManagement.draft.portal || {};
  const password = draft.portalPassword || "";
  const portalStatusLabel = customerPortalStatusLabelKey({
    drawerMode: state.customerManagement.drawerMode,
    draftPortalEmail: draft.portalEmail,
    persistedPortalEmail: customer?.portalEmail
  });
  return `
    <label>
      <span>${escapeHtml(t("Portal status"))}</span>
      <input data-customer-portal-status readonly value="${escapeHtml(t(portalStatusLabel))}">
    </label>
    <label>
      <span>${escapeHtml(t("Portal username"))}</span>
      <input data-customer-drawer-field name="portalEmail" ${isView ? "readonly" : ""} value="${escapeHtml(draft.portalEmail || "")}">
    </label>
    <label class="span-2">
      <span>${escapeHtml(t("New temporary password"))}</span>
      <input data-customer-drawer-field name="portalPassword" type="password" ${isView ? "readonly" : ""} value="${escapeHtml(password)}" autocomplete="new-password">
    </label>
    ${isView ? "" : `<div class="modal-actions span-2">
      <button class="secondary-action" type="button" data-toggle-temp-password>${escapeHtml(t("Show password"))}</button>
      <button class="secondary-action" type="button" data-generate-temp-password>${escapeHtml(t("Generate temporary password"))}</button>
      <button class="secondary-action" type="button" data-copy-temp-password ${password ? "" : "disabled"}>${escapeHtml(t("Copy temporary password"))}</button>
    </div>`}
  `;
}

function afterRenderCustomerManagementDrawer() {
  populateTimeSelects();
  const draft = state.customerManagement.draft.basic || {};
  const form = document.getElementById("customerBasicForm");
  if (form) {
    const openTimeField = form.elements.companyOpenTime;
    const closeTimeField = form.elements.companyCloseTime;
    if (openTimeField) openTimeField.value = draft.companyOpenTime || "";
    if (closeTimeField) closeTimeField.value = draft.companyCloseTime || "";
    wireZipAutofill();
  }
  renderCarrierPreferences();
  updateCustomerPricingPreview();
}

function renderCustomerManagementDrawer() {
  if (state.modal?.type === "customerManagement") {
    renderModal();
  }
}

function selectedCustomer() {
  return state.customers.find((customer) => customer.id === state.customerManagement.selectedCustomerId) || null;
}

function markCustomerManagementSectionDirty(section) {
  if (state.customerManagement.drawerMode === "view") {
    return;
  }
  state.customerManagement.dirtySections = customerManagementSectionDirtyState(state.customerManagement.dirtySections, section, true);
  syncCustomerManagementDirtyState();
}

function clearCustomerManagementSectionDirty(section) {
  state.customerManagement.dirtySections = customerManagementSectionDirtyState(state.customerManagement.dirtySections, section, false);
  syncCustomerManagementDirtyState();
}

function isCustomerManagementSectionDirty(section) {
  return customerManagementSectionIsDirty(state.customerManagement.dirtySections, section);
}

function hasCustomerManagementUnsavedChanges() {
  return customerManagementHasUnsavedChanges(state.customerManagement.dirtySections);
}

function syncCustomerManagementDirtyState() {
  state.customerManagement.dirty = hasCustomerManagementUnsavedChanges();
}

function customerManagementSectionForField(field) {
  if (field.closest("#customerPricingForm") || field.matches("[data-customer-mode-quote], [data-customer-mode-booking]")) {
    return "pricing";
  }
  if (field.closest("#customerPortalForm")) {
    return "portal";
  }
  if (field.closest("#customerBlockedCarrierForm")) {
    return "blocked";
  }
  if (field.closest("#customerBasicForm") && (field.name === "portalEmail" || field.name === "portalPassword")) {
    return "portal";
  }
  return "basic";
}

function syncCustomerPortalStatus() {
  if (state.customerManagement.drawerMode === "view") {
    return;
  }
  const statusInput = document.querySelector("[data-customer-portal-status]");
  if (!statusInput) {
    return;
  }
  const portalEmail = document.querySelector("#customerPortalForm [name='portalEmail'], #customerBasicForm [name='portalEmail']")?.value || state.customerManagement.draft.portal?.portalEmail || "";
  statusInput.value = t(customerPortalStatusLabelKey({
    drawerMode: state.customerManagement.drawerMode,
    draftPortalEmail: portalEmail,
    persistedPortalEmail: selectedCustomer()?.portalEmail
  }));
}

function resetCustomerManagementDraft() {
  state.customerManagement.temporaryPassword = "";
  state.customerManagement.dirtySections = defaultCustomerManagementDirtySections();
  syncCustomerManagementDirtyState();
  state.customerManagement.draft = {
    basic: {},
    pricing: {},
    portal: {},
    blocked: {},
    carrierModes: {
      allowedCarrierModes: [],
      allowedBookingCarrierModes: []
    }
  };
}

function initializeCustomerManagementDraft(customer = null) {
  const tariff = customer?.id ? state.tariffs.find((rule) => rule.customerId === customer.id) : null;
  state.customerManagement.draft = customerManagementDraftFromPersisted(customer || {}, tariff);
  state.customerManagement.temporaryPassword = "";
}

function mergeCustomerManagementDraftFromCurrentPersisted(customer = selectedCustomer()) {
  const tariff = customer?.id ? state.tariffs.find((rule) => rule.customerId === customer.id) : null;
  state.customerManagement.draft = mergeCustomerManagementDraftFromPersisted({
    draft: state.customerManagement.draft,
    dirtySections: state.customerManagement.dirtySections,
    customer: customer || {},
    tariff
  });
  state.customerManagement.temporaryPassword = state.customerManagement.draft.portal?.portalPassword || state.customerManagement.temporaryPassword || "";
}

function captureCustomerManagementDraft() {
  if (!shouldCaptureCustomerManagementDraft(state.customerManagement.drawerMode)) {
    return;
  }
  const basicForm = document.getElementById("customerBasicForm");
  if (basicForm) {
    state.customerManagement.draft.basic = {
      ...state.customerManagement.draft.basic,
      ...customerBasicDraftFromForm(basicForm)
    };
    if (basicForm.elements.portalEmail || basicForm.elements.portalPassword) {
      state.customerManagement.draft.portal = {
        ...state.customerManagement.draft.portal,
        portalEmail: basicForm.elements.portalEmail?.value || "",
        portalPassword: basicForm.elements.portalPassword?.value || ""
      };
      state.customerManagement.temporaryPassword = state.customerManagement.draft.portal.portalPassword || "";
    }
  }
  const pricingForm = document.getElementById("customerPricingForm");
  if (pricingForm) {
    state.customerManagement.draft.pricing = {
      ...state.customerManagement.draft.pricing,
      ruleType: pricingForm.elements.ruleType?.value === "fixed" ? "fixed" : "percentage",
      fixedAmount: pricingForm.elements.fixedAmount?.value ?? state.customerManagement.draft.pricing.fixedAmount ?? 50,
      markupPercentage: pricingForm.elements.markupPercentage?.value ?? state.customerManagement.draft.pricing.markupPercentage ?? 15
    };
    const allowedCarrierModes = Array.from(pricingForm.querySelectorAll("[data-customer-mode-quote]:checked")).map((item) => item.value);
    const allowedBookingCarrierModes = Array.from(pricingForm.querySelectorAll("[data-customer-mode-booking]:checked"))
      .map((item) => item.value)
      .filter((mode) => allowedCarrierModes.includes(mode));
    state.customerManagement.draft.carrierModes = {
      allowedCarrierModes,
      allowedBookingCarrierModes
    };
  }
  const portalForm = document.getElementById("customerPortalForm");
  if (portalForm) {
    state.customerManagement.draft.portal = {
      portalEmail: portalForm.elements.portalEmail?.value || "",
      portalPassword: portalForm.elements.portalPassword?.value || ""
    };
    state.customerManagement.temporaryPassword = state.customerManagement.draft.portal.portalPassword || "";
  }
  const blockedForm = document.getElementById("customerBlockedCarrierForm");
  if (blockedForm) {
    state.customerManagement.draft.blocked = {
      carrierKey: blockedForm.elements.carrierKey?.value || "",
      carrierName: blockedForm.elements.carrierName?.value || "",
      reason: blockedForm.elements.reason?.value || ""
    };
  }
}

function setCustomerDrawerTab(tab) {
  const nextTab = tab || "basic";
  if (isCustomerManagementTabDisabled({ drawerMode: state.customerManagement.drawerMode, tab: nextTab })) {
    return;
  }
  const wasDirty = hasCustomerManagementUnsavedChanges();
  if (shouldCaptureCustomerManagementDraft(state.customerManagement.drawerMode)) {
    captureCustomerManagementDraft();
  }
  state.customerManagement.drawerTab = nextTab;
  state.customerManagement.dirty = customerManagementDirtyAfterTabSwitch(wasDirty);
  renderCustomerManagementDrawer();
  if (state.customerManagement.drawerTab === "blocked") {
    refreshCarrierPreferences({ silent: true });
  }
}

function customerAddressLine(customer) {
  return customer ? [customer.companyStreet, customer.companyCity, customer.companyState, customer.companyZip].filter(Boolean).join(", ") : "";
}

function pricingPreviewHtml(ruleType, tariff) {
  const base = 500;
  const fixedAmount = Number(tariff.fixedAmount || 0);
  const markupPercentage = Number(tariff.markupPercentage || 0);
  const customerPrice = ruleType === "fixed" ? base + fixedAmount : base * (1 + markupPercentage / 100);
  return `
    <strong>${escapeHtml(t("Example calculation"))}</strong>
    <span>${escapeHtml(t("Carrier cost"))}: ${money.format(base)}</span>
    <span>${escapeHtml(t("Customer price"))}: ${money.format(customerPrice)}</span>
  `;
}

function updateCustomerPricingPreview() {
  const form = document.getElementById("customerPricingForm");
  const preview = document.getElementById("customerPricingPreview");
  if (!form || !preview) return;
  const ruleType = form.elements.ruleType?.value === "fixed" ? "fixed" : "percentage";
  preview.innerHTML = pricingPreviewHtml(ruleType, {
    fixedAmount: form.elements.fixedAmount?.value,
    markupPercentage: form.elements.markupPercentage?.value
  });
}

async function saveCustomerBasicForm(formElement) {
  if (!isStaffUser()) return;
  if (state.customerManagement.saving) return;
  captureCustomerManagementDraft();
  const payload = customerPayloadFromDraft();
  const validation = validateCustomerBasicPayload(payload);
  if (validation) {
    state.customerManagement.error = validation;
    renderCustomerManagementDrawer();
    return;
  }
  try {
    state.customerManagement.saving = "basic";
    renderCustomerManagementDrawer();
    if (state.customerManagement.drawerMode === "create") {
      const response = await api("/api/customers", { method: "POST", body: payload });
      const createdCustomer = response.customer || null;
      await refreshAll();
      const createdId = createdCustomer?.id || resolveCreatedCustomerId(payload);
      if (createdId) {
        state.customerManagement.selectedCustomerId = createdId;
        state.customerManagement.drawerMode = "edit";
        state.customerManagement.drawerTab = "pricing";
        clearCustomerManagementSectionDirty("basic");
        clearCustomerManagementSectionDirty("portal");
        initializeCustomerManagementDraft(state.customers.find((customer) => customer.id === createdId) || createdCustomer);
      }
      state.customerManagement.error = "";
      showToast(t("Customer created. Configure pricing and carrier channels."));
      renderCustomerManagementDrawer();
      return;
    }
    const customerId = state.customerManagement.selectedCustomerId;
    await api(`/api/customers/${encodeURIComponent(customerId)}`, { method: "PATCH", body: payload });
    clearCustomerManagementSectionDirty("basic");
    state.customerManagement.error = "";
    showToast(t("Customer updated."));
    await refreshAll();
    mergeCustomerManagementDraftFromCurrentPersisted(selectedCustomer());
  } catch (error) {
    state.customerManagement.error = error.message || t("Request failed.");
    showToast(state.customerManagement.error, true);
    renderCustomerManagementDrawer();
  } finally {
    state.customerManagement.saving = "";
    renderCustomerManagementDrawer();
  }
}

async function saveCustomerPricingForm(formElement) {
  if (!isStaffUser()) return;
  if (state.customerManagement.saving) return;
  captureCustomerManagementDraft();
  const customer = selectedCustomer();
  if (!customer) return;
  const form = new FormData(formElement);
  const allowedCarrierModes = Array.from(formElement.querySelectorAll("[data-customer-mode-quote]:checked")).map((item) => item.value);
  const allowedBookingCarrierModes = Array.from(formElement.querySelectorAll("[data-customer-mode-booking]:checked")).map((item) => item.value).filter((mode) => allowedCarrierModes.includes(mode));
  const error = document.getElementById("customerPricingFormError");
  if (error) error.textContent = "";
  if (allowedCarrierModes.length === 0) {
    const message = t("Select at least one carrier mode for this customer.");
    if (error) error.textContent = message;
    showToast(message, true);
    return;
  }
  try {
    state.customerManagement.saving = "pricing";
    renderCustomerManagementDrawer();
    await api("/api/tariffs", {
      method: "POST",
      body: {
        customerId: customer.id,
        ruleType: form.get("ruleType"),
        fixedAmount: form.get("ruleType") === "fixed" ? form.get("fixedAmount") : "0",
        markupPercentage: form.get("ruleType") === "percentage" ? form.get("markupPercentage") : "0",
        allowedCarrierModes,
        allowedBooking: allowedBookingCarrierModes.length > 0,
        allowedBookingCarrierModes
      }
    });
    clearCustomerManagementSectionDirty("pricing");
    showToast(t("Tariff saved."));
    await refreshAll();
    mergeCustomerManagementDraftFromCurrentPersisted(selectedCustomer());
  } catch (error) {
    showToast(error.message || t("Request failed."), true);
  } finally {
    state.customerManagement.saving = "";
    renderCustomerManagementDrawer();
  }
}

async function saveCustomerPortalForm(formElement) {
  if (!isStaffUser()) return;
  if (state.customerManagement.saving) return;
  captureCustomerManagementDraft();
  const customer = selectedCustomer();
  if (!customer) return;
  const form = new FormData(formElement);
  const body = {
    portalEmail: form.get("portalEmail")
  };
  if (String(form.get("portalPassword") || "").trim()) {
    body.portalPassword = form.get("portalPassword");
  }
  try {
    state.customerManagement.saving = "portal";
    renderCustomerManagementDrawer();
    await api(`/api/customers/${encodeURIComponent(customer.id)}`, { method: "PATCH", body });
    clearCustomerManagementSectionDirty("portal");
    clearCustomerTemporaryPassword();
    showToast(t("Customer updated."));
    await refreshAll();
    mergeCustomerManagementDraftFromCurrentPersisted(selectedCustomer());
  } catch (error) {
    showToast(error.message || t("Request failed."), true);
  } finally {
    state.customerManagement.saving = "";
    renderCustomerManagementDrawer();
  }
}

async function saveCustomerBlockedCarrierForm(formElement) {
  if (!isStaffUser()) return;
  if (state.customerManagement.saving) return;
  captureCustomerManagementDraft();
  const customer = selectedCustomer();
  if (!customer) return;
  const form = new FormData(formElement);
  try {
    state.customerManagement.saving = "blocked";
    renderCustomerManagementDrawer();
    await api("/api/carrier-preferences", {
      method: "POST",
      body: {
        customerId: customer.id,
        carrierKey: form.get("carrierKey"),
        carrierName: form.get("carrierName") || form.get("carrierKey"),
        preference: "blocked",
        reason: form.get("reason")
      }
    });
    state.customerManagement.draft.blocked = { carrierKey: "", carrierName: "", reason: "" };
    clearCustomerManagementSectionDirty("blocked");
    showToast(t("Blocked carrier added."));
    await refreshCarrierPreferences();
    renderCustomerManagementDrawer();
  } catch (error) {
    showToast(error.message || t("Request failed."), true);
    renderCustomerManagementDrawer();
  } finally {
    state.customerManagement.saving = "";
    renderCustomerManagementDrawer();
  }
}

function customerPayloadFromForm(form) {
  const payload = {
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
    status: form.get("status") || "active"
  };
  if (form.has("portalEmail")) {
    payload.portalEmail = form.get("portalEmail");
  }
  if (String(form.get("portalPassword") || "").trim()) {
    payload.portalPassword = form.get("portalPassword");
  }
  return payload;
}

function customerPayloadFromDraft() {
  const basic = state.customerManagement.draft.basic || {};
  const portal = state.customerManagement.draft.portal || {};
  const payload = {
    companyName: basic.companyName,
    billingEmail: basic.billingEmail,
    paymentTerms: basic.paymentTerms,
    companyPhone: basic.companyPhone,
    companyOpenTime: basic.companyOpenTime,
    companyCloseTime: basic.companyCloseTime,
    companyStreet: basic.companyStreet,
    companyCity: basic.companyCity,
    companyState: basic.companyState,
    companyZip: basic.companyZip,
    status: basic.status || "active"
  };
  if (state.customerManagement.drawerMode === "create") {
    payload.portalEmail = portal.portalEmail || "";
    if (String(portal.portalPassword || "").trim()) {
      payload.portalPassword = portal.portalPassword;
    }
  }
  return payload;
}

function customerBasicDraftFromForm(formElement) {
  const previous = state.customerManagement.draft.basic || {};
  const value = (name) => {
    const field = formElement.elements[name];
    return field ? field.value : previous[name] || "";
  };
  return {
    companyName: value("companyName"),
    billingEmail: value("billingEmail"),
    paymentTerms: value("paymentTerms"),
    companyPhone: value("companyPhone"),
    companyOpenTime: value("companyOpenTime"),
    companyCloseTime: value("companyCloseTime"),
    companyStreet: value("companyStreet"),
    companyCity: value("companyCity"),
    companyState: value("companyState"),
    companyZip: value("companyZip"),
    status: value("status") || previous.status || "active"
  };
}

function validateCustomerBasicPayload(payload) {
  if (!String(payload.companyName || "").trim()) return t("Please fill in the required fields.");
  if (payload.billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.billingEmail))) return t("Please fill in the required fields.");
  if (payload.companyState && !/^[A-Za-z]{2}$/.test(String(payload.companyState))) return t("Please fill in the required fields.");
  if (payload.companyOpenTime && payload.companyCloseTime) {
    const open = normalizeTimeForCustomerManagement(payload.companyOpenTime);
    const close = normalizeTimeForCustomerManagement(payload.companyCloseTime);
    if (open !== null && close !== null && open >= close) return t("Opening time must be earlier than closing time.");
  }
  return "";
}

function normalizeTimeForCustomerManagement(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 4) return null;
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2));
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function resolveCreatedCustomerId(payload) {
  const portalEmail = String(payload.portalEmail || "").trim().toLowerCase();
  const companyName = String(payload.companyName || "").trim().toLowerCase();
  const matches = state.customers.filter((customer) => {
    if (portalEmail && String(customer.portalEmail || "").trim().toLowerCase() === portalEmail) return true;
    return companyName && String(customer.companyName || "").trim().toLowerCase() === companyName;
  });
  return matches.length === 1 ? matches[0].id : "";
}

function handleCustomerModeQuoteChange(checkbox) {
  const form = checkbox.closest("form");
  if (!form) return;
  const booking = Array.from(form.querySelectorAll("[data-customer-mode-booking]")).find((item) => item.value === checkbox.value);
  if (booking) {
    booking.disabled = !checkbox.checked;
    if (!checkbox.checked) booking.checked = false;
  }
  markCustomerManagementSectionDirty("pricing");
  captureCustomerManagementDraft();
}

function handleCustomerModeBookingChange(checkbox) {
  const form = checkbox.closest("form");
  if (!form) return;
  const allowedModes = Array.from(form.querySelectorAll("[data-customer-mode-quote]:checked")).map((item) => item.value);
  checkbox.checked = checkbox.checked && canEnableBookingMode(checkbox.value, allowedModes);
  markCustomerManagementSectionDirty("pricing");
  captureCustomerManagementDraft();
}

function generateCustomerTemporaryPassword() {
  captureCustomerManagementDraft();
  const password = createSecureTemporaryPassword();
  if (!password) {
    showToast(t("Password could not be generated securely."), true);
    return;
  }
  state.customerManagement.draft.portal.portalPassword = password;
  state.customerManagement.temporaryPassword = password;
  markCustomerManagementSectionDirty("portal");
  const input = document.querySelector("#customerPortalForm [name='portalPassword'], #customerBasicForm [name='portalPassword']");
  if (input) {
    input.value = password;
  }
  document.querySelectorAll("[data-copy-temp-password]").forEach((button) => {
    button.disabled = false;
  });
}

function createSecureTemporaryPassword() {
  const cryptoApi = window.crypto || window.msCrypto;
  if (!cryptoApi?.getRandomValues) {
    return "";
  }
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%?"
  ];
  const alphabet = groups.join("");
  const values = new Uint32Array(20);
  cryptoApi.getRandomValues(values);
  const required = groups.map((group, index) => group[values[index] % group.length]);
  const remaining = Array.from(values.slice(groups.length), (value) => alphabet[value % alphabet.length]);
  const password = [...required, ...remaining];
  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = values[index] % (index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }
  return password.join("");
}

async function copyCustomerTemporaryPassword() {
  captureCustomerManagementDraft();
  const password = state.customerManagement.temporaryPassword || state.customerManagement.draft.portal?.portalPassword || "";
  if (!password) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(password);
    showToast(t("Copy temporary password"));
  } catch {
    showToast(t("Copy failed. Select and copy the temporary password manually."), true);
  }
}

function toggleCustomerTemporaryPasswordVisibility() {
  const inputs = Array.from(document.querySelectorAll("[name='portalPassword']"));
  const shouldShow = inputs.some((input) => input.type === "password");
  inputs.forEach((input) => {
    input.type = shouldShow ? "text" : "password";
  });
  document.querySelectorAll("[data-toggle-temp-password]").forEach((button) => {
    button.textContent = t(shouldShow ? "Hide password" : "Show password");
  });
}

function clearCustomerTemporaryPassword() {
  state.customerManagement.temporaryPassword = "";
  if (state.customerManagement.draft?.portal) {
    state.customerManagement.draft.portal.portalPassword = "";
  }
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
  showToast(t("Customer {status}.", { status: t(nextStatus === "disabled" ? "account.status.disabled" : "account.status.active") }));
  await refreshAll();
}

async function deleteCustomerAccount(customerId) {
  const customer = state.customers.find((item) => item.id === customerId);
  if (!customer) {
    return;
  }

  window.alert(t("Deleting this customer may affect related quotes, shipments, and invoices."));
  const typed = window.prompt(t("Type {name} to confirm deletion.", { name: customer.companyName }));
  if (typed !== customer.companyName) {
    showToast(t("Delete confirmation did not match the company name."), true);
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

  const openLabel = customer.companyOpenTime ? formatTimeHour(customer.companyOpenTime) : t("business.openingTime");
  const closeLabel = customer.companyCloseTime ? formatTimeHour(customer.companyCloseTime) : t("business.closingTime");
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
  const statusPill = isCustomerUser()
    ? customerShipmentStatusBadgeHtml(shipment.status)
    : shipment.status === "booked_with_carrier" ? "" : `<span class="pill">${escapeHtml(shipment.status)}</span>`;
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
  const customerView = isCustomerUser();
  const sourceLabel = invoice.source === "mothership" ? t("Mothership") : t("Local");
  const referenceOnly = isImportedInvoiceReference(invoice);
  const podTarget = resolveInvoiceDocumentTarget(invoice);
  const shipment = podTarget.localShipment;
  const customerStatusLabel = invoiceStatusLabel(invoice);
  const subLabel = customerView
    ? [invoice.customerName, invoice.referenceNumber ? `PO ${invoice.referenceNumber}` : ""].filter(Boolean).map(escapeHtml).join(" · ")
    : podTarget.displayLabel
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
          <span class="pill">${escapeHtml(customerView ? customerStatusLabel : invoice.status)}</span>
          ${customerView ? "" : `<span class="pill">${escapeHtml(sourceLabel)}</span>`}
          ${!customerView && referenceOnly ? `<span class="pill">${t("Reference only")}</span>` : ""}
          ${invoice.referenceNumber ? `<span class="pill">PO ${escapeHtml(invoice.referenceNumber)}</span>` : ""}
          <span class="pill">${formatDate(invoice.createdAt)}</span>
        </div>
      </div>
      <div class="price-block">
        ${referenceOnly ? `<small>${t("Waiting for detail fields")}</small>` : ""}
        <strong>${referenceOnly ? t("document.status.pending") : money.format(invoice.amount)}</strong>
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

function invoiceStatusLabel(invoice) {
  const status = normalizeInvoiceStatus(invoice?.status);
  if (status === "open") {
    return t("Open Invoices");
  }
  if (status === "paid") {
    return t("Paid");
  }
  if (status === "void" || status === "cancelled") {
    return t("Cancelled");
  }
  return t("Status Pending");
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
    return quote.carrierAudit.map((row) => ({
      ...row,
      carrierMessage: row.carrierMessage || row.message || row.error || "",
      request: row.request ?? row.carrierRequest,
      response: row.response ?? row.rawCarrierResponse,
      carrierQuoteId: row.carrierQuoteId || row.quoteId || ""
    }));
  }

  if (Array.isArray(quote?.rawCarrierResponse) && quote.rawCarrierResponse.length > 0) {
    return quote.rawCarrierResponse.map((run) => ({
      mode: run.mode,
      carrier: run.carrier,
      carrierQuoteId: run.carrierQuoteId,
      carrierMessage: run.carrierMessage || run.message || run.error || "",
      rateCount: Array.isArray(run.rates) ? run.rates.length : 0,
      request: run.carrierRequest || run.request || null,
      response: run.rawCarrierResponse || run.response
    }));
  }

  return [];
}

function quoteCarrierStatusHtml(quote) {
  if (!isStaffUser()) {
    return "";
  }

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

function rateAvailabilityNoticeHtml(rateAvailability) {
  if (rateAvailability?.status !== "partial" || rateAvailability?.messageCode !== "PARTIAL_RATES_UNAVAILABLE") {
    return "";
  }

  return `
    <div class="quote-status notice-state">
      <p>${escapeHtml(t("Some rates are temporarily unavailable. The available results are shown below. Please try again later or contact customer service."))}</p>
    </div>
  `;
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

function customerQuoteDetailsHtml(quote) {
  return renderCustomerQuoteDetailsShell(quote);
}

function renderCustomerQuoteDetailsShell(quote) {
  const quoteNumber = customerQuoteNumber(quote);
  const controls = customerQuoteDetailsControls(quote.id);
  const originalRates = customerVisibleRates(quote);
  const lowest = quoteLowestSellPrice({ rates: originalRates });
  const expiration = customerQuoteExpirationDate(quote);
  const expired = normalizeQuoteStatus(quote.status) === "expired";
  const accountBookingAllowed = customerBookingAllowed(quote.customerId);
  return `
    <div class="customer-quote-details">
      <section class="customer-quote-details-header">
        <div class="customer-quote-details-heading">
          <div class="customer-quote-title-row">
            <strong>${escapeHtml(t("Quote {quoteNumber}", { quoteNumber }))}</strong>
            ${customerQuoteStatusBadgeHtml(quote)}
          </div>
          <p>${escapeHtml(routeLabel(quote.pickup, quote.delivery))}</p>
          <small>${escapeHtml(t("Rates quoted on {dateTime}", { dateTime: formatDateTime(quote.createdAt) }))}</small>
          ${expiration ? `<small>${escapeHtml(t("Expires {dateTime}", { dateTime: formatDateTime(expiration) }))}</small>` : ""}
        </div>
        <div class="customer-quote-details-actions">
          <button class="secondary-action" type="button" data-customer-quote-reenter="${escapeHtml(quote.id)}">${t("Use as New Quote")}</button>
          <button class="secondary-action" type="button" data-customer-quote-close>${t("action.close")}</button>
        </div>
      </section>
      ${expired ? `<div class="quote-status notice-state compact-notice">${escapeHtml(t("These rates may no longer be available. Get updated rates before booking."))}</div>` : ""}
      ${accountBookingAllowed ? "" : `<div class="quote-status notice-state compact-notice">${escapeHtml(t("Online booking is not enabled for this account. Contact customer service for assistance."))}</div>`}
      ${rateAvailabilityNoticeHtml(quote.rateAvailability)}
      ${customerQuoteSummaryHtml(quote, originalRates, lowest)}
      <section class="detail-section customer-rate-section">
        <div class="customer-rate-toolbar">
          <div>
            <h3>${escapeHtml(t("Available Rates"))}</h3>
            <small data-customer-quote-rate-count="${escapeHtml(quote.id)}"></small>
          </div>
          <label>
            ${escapeHtml(t("Search carrier"))}
            <input type="search" value="${escapeHtml(controls.search)}" data-customer-quote-search="${escapeHtml(quote.id)}" placeholder="${escapeHtml(t("Search carrier"))}">
          </label>
          <label>
            ${escapeHtml(t("Sort"))}
            <select data-customer-quote-sort="${escapeHtml(quote.id)}">
              <option value="lowestPrice" ${controls.sort === "lowestPrice" ? "selected" : ""}>${t("Lowest Price")}</option>
              <option value="fastestTransit" ${controls.sort === "fastestTransit" ? "selected" : ""}>${t("Fastest Transit")}</option>
              <option value="earliestEta" ${controls.sort === "earliestEta" ? "selected" : ""}>${t("Earliest ETA")}</option>
            </select>
          </label>
        </div>
        <div class="customer-rate-list" data-customer-quote-rate-list="${escapeHtml(quote.id)}"></div>
        <div class="rate-list-footer" data-customer-quote-rate-footer="${escapeHtml(quote.id)}"></div>
      </section>
    </div>
  `;
}

function customerQuoteDetailsControls(quoteId) {
  if (state.customerQuoteDetails.quoteId !== quoteId) {
    resetCustomerQuoteDetailsControls(quoteId);
  }
  return state.customerQuoteDetails;
}

function customerQuoteDetailsRates(quote) {
  return customerQuoteRateCollections(quote).sortedFilteredRates;
}

function customerQuoteRateCollections(quote) {
  const controls = customerQuoteDetailsControls(quote?.id || "");
  const originalRates = customerVisibleRates(quote);
  const filteredRates = filterCustomerQuoteRates(originalRates, quote, controls.search);
  const sortedFilteredRates = sortCustomerQuoteRates(filteredRates, quote, controls.sort);
  const visibleRates = sortedFilteredRates.slice(0, controls.visibleCount);
  return {
    controls,
    originalRates,
    filteredRates,
    sortedFilteredRates,
    visibleRates
  };
}

function filterCustomerQuoteRates(rates, quote, searchValue) {
  const search = String(searchValue || "").trim().toLowerCase();
  if (!search) {
    return [...rates];
  }
  return rates.filter((rate) => carrierNameLabel(rate, quote, true).toLowerCase().includes(search));
}

function sortCustomerQuoteRates(rates, quote, sort) {
  return [...rates].sort((left, right) => {
    if (sort === "fastestTransit") {
      return compareNullableNumbers(customerRateTransitDays(left), customerRateTransitDays(right)) || compareCustomerRatePrices(left, right) || compareRateCarrierNames(left, right, quote);
    }
    if (sort === "earliestEta") {
      return compareNullableNumbers(customerRateEtaTime(left), customerRateEtaTime(right)) || compareCustomerRatePrices(left, right) || compareRateCarrierNames(left, right, quote);
    }
    return compareCustomerRatePrices(left, right) || compareRateCarrierNames(left, right, quote);
  });
}

function renderCustomerQuoteRateResults(quote) {
  const collections = customerQuoteRateCollections(quote);
  const countText = customerQuoteRateCountText(collections);
  const listHtml = collections.visibleRates.length
    ? collections.visibleRates.map((rate) => customerQuoteRateCardHtml(quote, rate, collections.originalRates)).join("")
    : `<div class="empty-state">${escapeHtml(t("No rates match your search."))}</div>`;
  const footerHtml = collections.visibleRates.length < collections.sortedFilteredRates.length
    ? `<button class="secondary-action" type="button" data-customer-quote-load-more="${escapeHtml(quote.id)}">${t("Load More")}</button>`
    : "";
  return {
    countText,
    listHtml,
    footerHtml
  };
}

function customerQuoteRateCountText(collections) {
  if (String(collections.controls.search || "").trim()) {
    return t("Showing {visible} of {matching} matching rates · {total} total", {
      visible: collections.visibleRates.length,
      matching: collections.filteredRates.length,
      total: collections.originalRates.length
    });
  }
  return t("Showing {visible} of {total} rates", {
    visible: collections.visibleRates.length,
    total: collections.originalRates.length
  });
}

function compareCustomerRatePrices(left, right) {
  return compareNullableNumbers(validSellPrice(left), validSellPrice(right));
}

function compareRateCarrierNames(left, right, quote) {
  return carrierNameLabel(left, quote, true).localeCompare(carrierNameLabel(right, quote, true));
}

function compareNullableNumbers(left, right) {
  const leftValid = Number.isFinite(left);
  const rightValid = Number.isFinite(right);
  if (leftValid && rightValid && left !== right) {
    return left - right;
  }
  if (leftValid !== rightValid) {
    return leftValid ? -1 : 1;
  }
  return 0;
}

function customerQuoteRateCardHtml(quote, rate, allRates) {
  const bookingVisible = customerQuoteBookingControlsVisible(quote);
  const accountBookingAllowed = customerBookingAllowed(quote.customerId);
  const bookingAllowed = bookingVisible && accountBookingAllowed && rateBookingAllowedForUser(quote, rate);
  return `
    <article class="rate-item quote-rate-card customer-quote-rate-card">
      <div class="rate-main">
        <div class="rate-title-row">
          <span class="carrier-name-badge">${escapeHtml(carrierNameLabel(rate, quote, true))}</span>
          <span class="service-badge">${escapeHtml(formatRateService(rate?.service))}</span>
          ${customerRateBadgesHtml(rate, allRates)}
        </div>
        <div class="rate-meta-row">
          ${hasDisplayValue(rate.transitDays) ? `<span class="pill">${t("Transit")} ${escapeHtml(formatTransitDays(rate.transitDays))}</span>` : ""}
          ${hasDisplayValue(rate.estimatedDeliveryDate) ? `<span class="pill">ETA ${escapeHtml(formatDate(rate.estimatedDeliveryDate))}</span>` : ""}
        </div>
      </div>
      <div class="rate-aside customer-rate-price-aside">
        <small>${escapeHtml(t("Your Price"))}</small>
        <strong>${customerRatePriceHtml(rate)}</strong>
        ${bookingVisible && accountBookingAllowed
          ? bookingAllowed
            ? `<button class="primary-action rate-book-action" type="button" data-book-rate="${escapeHtml(rate.id)}" data-book-quote="${escapeHtml(quote.id)}">${t("Book Shipment")}</button>`
            : `<small class="helper-text booking-disabled-note">${t("Booking unavailable for this carrier.")}</small>`
          : ""}
      </div>
    </article>
  `;
}

function customerRateBadgesHtml(rate, rates) {
  const price = validSellPrice(rate);
  const transit = customerRateTransitDays(rate);
  const lowestPrice = Math.min(...rates.map(validSellPrice).filter(Number.isFinite));
  const fastestTransit = Math.min(...rates.map(customerRateTransitDays).filter(Number.isFinite));
  const badges = [];
  if (Number.isFinite(price) && price === lowestPrice) {
    badges.push(`<span class="best-rate-badge">${escapeHtml(t("Lowest Price"))}</span>`);
  }
  if (Number.isFinite(transit) && transit === fastestTransit) {
    badges.push(`<span class="best-rate-badge">${escapeHtml(t("Fastest"))}</span>`);
  }
  return badges.join("");
}

function customerRatePriceHtml(rate) {
  const price = validSellPrice(rate);
  return Number.isFinite(price) ? money.format(price) : escapeHtml(t("Price unavailable"));
}

function validSellPrice(rate) {
  return validCustomerSellPrice(rate);
}

function customerQuoteBookingControlsVisible(quote) {
  const status = normalizeQuoteStatus(quote?.status);
  return !["expired", "cancelled", "failed", "booked"].includes(status) && !quoteHasShipment(quote, state.shipments);
}

function customerRateTransitDays(rate) {
  return customerRateTransitDaysValue(rate);
}

function customerRateEtaTime(rate) {
  const date = parseDate(rate?.estimatedDeliveryDate);
  return date ? date.getTime() : Number.POSITIVE_INFINITY;
}

function customerQuoteExpirationDate(quote) {
  return [
    quote?.expiresAt,
    quote?.expiration,
    quote?.expirationDate,
    quote?.validUntil,
    quote?.ratesExpireAt,
    quote?.rateExpiration
  ].map(parseDate).find(Boolean) || null;
}

function customerQuoteSummaryHtml(quote, rates, lowest) {
  const freight = convertFreightRowsForDisplay(quote.freight, "imperial", quote.displayFreightUnits || "imperial");
  const freightSummary = customerFreightSummary(freight, quote.displayFreightUnits || "imperial");
  return `
    <section class="detail-section customer-quote-summary">
      <h3>${escapeHtml(t("Quote Summary"))}</h3>
      <div class="customer-summary-grid">
        ${customerSummaryItem("Quote Number", customerQuoteNumber(quote))}
        ${customerSummaryItem("Quote Status", t(quoteStatusLabelKey(quote, state.shipments)))}
        ${customerSummaryItem("Created", formatDateTime(quote.createdAt))}
        ${customerSummaryItem("Reference / PO", quote.referenceNumber || t("None"))}
        ${customerSummaryItem("Pickup company", quote.pickup?.name || t("None"))}
        ${customerSummaryItem("Pickup address", fullAddressLabel(quote.pickup?.address))}
        ${customerSummaryItem("Delivery company", quote.delivery?.name || t("None"))}
        ${customerSummaryItem("Delivery address", fullAddressLabel(quote.delivery?.address))}
        ${customerSummaryItem("Pickup ready", pickupReadyLabel(quote))}
        ${customerSummaryItem("Total handling units", freightSummary.handlingUnits)}
        ${customerSummaryItem("Total weight", freightSummary.totalWeight)}
        ${customerSummaryItem("Freight class", freightSummary.freightClass)}
        ${customerSummaryItem("Dimensions", freightSummary.dimensions)}
        ${customerSummaryItem("Description", freightSummary.description)}
        ${customerSummaryItem("Pickup accessorials", accessorialListLabel(quote.pickup?.accessorials))}
        ${customerSummaryItem("Delivery accessorials", accessorialListLabel(quote.delivery?.accessorials))}
        ${customerSummaryItem("Available rates", String(rates.length))}
        ${customerSummaryItem("Lowest price", Number.isFinite(lowest) ? money.format(lowest) : t("Price unavailable"))}
      </div>
      ${freight.length > 1 ? `
        <details class="customer-freight-details">
          <summary>${escapeHtml(t("Freight"))}</summary>
          <div>${freightDetailLinesHtml(freight, quote.displayFreightUnits || "imperial")}</div>
        </details>
      ` : ""}
    </section>
  `;
}

function customerSummaryItem(label, value) {
  return `
    <div>
      <small>${escapeHtml(t(label))}</small>
      <strong>${escapeHtml(String(value || t("None")))}</strong>
    </div>
  `;
}

function customerFreightSummary(freight, units = "imperial") {
  const config = getFreightUnitConfig(units);
  const handlingUnits = freight.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const totalWeight = freight.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.weight) || 0)), 0);
  const classes = uniqueValues(freight.map((item) => item.freightClass));
  const dimensions = uniqueValues(freight.map((item) => [item.length, item.width, item.height].filter(Boolean).join(" x ")));
  const descriptions = uniqueValues(freight.map((item) => item.description));
  return {
    handlingUnits: handlingUnits || t("None"),
    totalWeight: totalWeight ? `${totalWeight} ${config.totalWeightSummaryUnit}` : t("None"),
    freightClass: classes.length ? classes.join(", ") : t("None"),
    dimensions: dimensions.length ? `${dimensions.join("; ")} ${config.dimensionSummaryUnit}` : t("None"),
    description: descriptions.length ? descriptions.join("; ") : t("None")
  };
}

function uniqueValues(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function fullAddressLabel(address = {}) {
  return [address.street, address.city, address.state, address.zip, address.country].filter(Boolean).join(", ") || t("None");
}

function pickupReadyLabel(quote) {
  const date = quote.pickupReadyDate?.date || quote.pickupDate?.date || quote.pickupDate || "";
  const time = quote.pickupReadyDate?.time || quote.pickup?.readyTime || "";
  return [date ? formatDate(date) : "", time ? formatTimeHour(time) : ""].filter(Boolean).join(" ") || t("None");
}

function accessorialListLabel(values) {
  const labels = Array.isArray(values)
    ? values.filter(Boolean).map((value) => accessorialLabel(value, state.language))
    : [];
  return labels.length ? labels.join(", ") : t("None");
}

function quoteDetailsHtml(quote) {
  const customerView = isCustomerUser();
  if (customerView) {
    return customerQuoteDetailsHtml(quote);
  }
  return adminQuoteDetailsHtml(quote);
}

function customerNameById(customerId) {
  return state.customers.find((customer) => customer.id === customerId)?.companyName || "";
}

function adminSummaryItem(label, value) {
  return `
    <div>
      <small>${escapeHtml(t(label))}</small>
      <strong>${escapeHtml(String(value || t("Unavailable")))}</strong>
    </div>
  `;
}

function adminMoneyLabel(value) {
  return Number.isFinite(value) ? money.format(value) : t("Unavailable");
}

function formatPackagingLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const labels = {
    pallet: "Pallet",
    box: "Box",
    crate: "Crate",
    freight: "Freight"
  };
  return t(labels[normalized] || value || "Freight");
}

function adminChannelStatusLabel(status) {
  const labels = {
    success: "Success",
    noRates: "No Rates",
    partial: "Partial",
    failed: "Failed",
    excluded: "Excluded by Customer Settings",
    notAttempted: "Not Attempted",
    unknown: "Unknown"
  };
  return labels[status] || "Unknown";
}

function adminChannelStatusTone(status) {
  if (status === "success") {
    return "green";
  }
  if (status === "partial" || status === "noRates") {
    return "amber";
  }
  if (status === "failed") {
    return "red";
  }
  if (status === "excluded" || status === "notAttempted") {
    return "gray";
  }
  return "neutral";
}

function safeDiagnosticJson(value) {
  if (value === undefined || value === null || value === "") {
    return t("No data recorded.");
  }
  return JSON.stringify(value, null, 2);
}

async function copySanitizedDiagnostic(button) {
  if (button.disabled || button.getAttribute("aria-disabled") === "true") {
    showToast(t("Sanitized diagnostic failed safety validation and cannot be copied."), true);
    return;
  }
  const block = button.closest(".audit-block");
  const payloadBlock = block?.querySelector(".audit-json");
  const payload = payloadBlock?.textContent || "";
  if (!payload || payloadBlock?.dataset.diagnosticSafe !== "true") {
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    }
    showToast(t("Sanitized diagnostic failed safety validation and cannot be copied."), true);
    return;
  }
  try {
    await navigator.clipboard.writeText(payload);
    showToast(t("Sanitized diagnostic copied."));
  } catch (error) {
    showToast(t("Copy failed. Select and copy the diagnostic manually."), true);
  }
}

function adminQuoteDetailsHtml(quote) {
  const viewModel = adminQuoteDetailsViewModel(quote, {
    customerName: customerNameById(quote.customerId),
    quoteHasShipment: quoteHasShipment(quote, state.shipments),
    bookingAllowed: (sourceQuote, rate) => rateBookingAllowedForUser(sourceQuote, rate)
  });
  const header = viewModel.header;
  const expiration = header.expiresAt ? formatDateTime(header.expiresAt) : t("Unavailable");
  return `
    <div class="admin-quote-details">
      <section class="admin-quote-header">
        <div class="admin-quote-heading">
          <div class="customer-quote-title-row">
            <strong>${escapeHtml(t("Quote Details"))}</strong>
            ${customerQuoteStatusBadgeHtml(quote)}
          </div>
          <h2>${escapeHtml(t("Quote {quoteNumber}", { quoteNumber: customerQuoteNumber(quote) }))}</h2>
          <p>${escapeHtml(header.route || routeLabel(quote.pickup, quote.delivery))}</p>
          <small>${escapeHtml(t("Customer"))}: ${escapeHtml(header.customerName || customerNameById(quote.customerId) || t("None"))}</small>
          <small>${escapeHtml(t("Created"))}: ${escapeHtml(formatDateTime(header.createdAt))} · ${escapeHtml(t("Quote Expiration"))}: ${escapeHtml(expiration)}</small>
          <small>${escapeHtml(t("Reference / PO"))}: ${escapeHtml(header.referenceNumber || t("None"))}</small>
        </div>
        <div class="admin-quote-actions">
          <button class="secondary-action" type="button" data-reenter-quote="${escapeHtml(quote.id)}">${t("Use as New Quote")}</button>
          <button class="secondary-action" type="button" data-admin-quote-close>${t("action.close")}</button>
        </div>
      </section>
      ${adminQuoteOverviewHtml(quote, viewModel)}
      ${adminQuoteRouteFreightHtml(quote, viewModel)}
      ${adminQuoteFinancialSummaryHtml(viewModel.financial)}
      ${adminQuoteRateComparisonHtml(quote)}
      ${adminQuoteCarrierChannelsHtml(quote)}
      ${adminQuoteDiagnosticsHtml(quote)}
    </div>
  `;
}

function adminQuoteOverviewHtml(quote, viewModel) {
  const modes = quoteCarrierModesList(quote);
  return `
    <section class="detail-section admin-quote-section">
      <h3>${escapeHtml(t("Quote Overview"))}</h3>
      <div class="admin-overview-grid">
        ${adminSummaryItem("Customer", viewModel.header.customerName || customerNameById(quote.customerId) || t("None"))}
        ${adminSummaryItem("Quote Number", customerQuoteNumber(quote))}
        ${adminSummaryItem("Quote Status", t(quoteStatusLabelKey(quote, state.shipments)))}
        ${adminSummaryItem("Reference / PO", quote.referenceNumber || t("None"))}
        ${adminSummaryItem("Created", formatDateTime(quote.createdAt))}
        ${adminSummaryItem("Pickup ready", pickupReadyLabel(quote))}
        ${adminSummaryItem("Available rate count", String(Array.isArray(quote.rates) ? quote.rates.length : 0))}
        ${adminSummaryItem("Configured carrier channels", modes.length ? modes.map((mode) => t(carrierModeSummaryLabel(mode, false))).join(", ") : t("None"))}
      </div>
    </section>
  `;
}

function adminQuoteRouteFreightHtml(quote, viewModel) {
  const freightRows = aggregateAdminFreightRows(convertFreightRowsForDisplay(quote.freight, "imperial", quote.displayFreightUnits || "imperial"));
  const freightSummary = adminFreightSummary(freightRows);
  return `
    <section class="detail-section admin-quote-section">
      <h3>${escapeHtml(t("Route & Freight"))}</h3>
      <div class="admin-route-grid">
        ${adminAddressCardHtml("Pickup", adminAddressViewModel(quote.pickup || {}))}
        ${adminAddressCardHtml("Delivery", adminAddressViewModel(quote.delivery || {}))}
      </div>
      ${adminFreightSummaryCardsHtml(freightSummary, quote.displayFreightUnits || "imperial")}
      ${adminFreightTableHtml(freightRows, quote.displayFreightUnits || "imperial")}
      ${adminTariffHtml(adminTariffSummary(quote.tariffRule || quote.tariffSnapshot || null))}
    </section>
  `;
}

function adminAddressCardHtml(label, address) {
  return `
    <article class="admin-address-card">
      <h4>${escapeHtml(t(label))}</h4>
      <strong>${escapeHtml(address.name || t("None"))}</strong>
      ${address.street ? `<span>${escapeHtml(address.street)}</span>` : ""}
      ${address.cityStateZip ? `<span>${escapeHtml(address.cityStateZip)}</span>` : ""}
      ${address.phone ? `<span>${escapeHtml(address.phone)}</span>` : ""}
      ${address.hours ? `<span>${escapeHtml(t("Hours"))}: ${escapeHtml(address.hours)}</span>` : ""}
      <span>${escapeHtml(t("Accessorials"))}: ${escapeHtml(accessorialListLabel(address.accessorials))}</span>
    </article>
  `;
}

function adminFreightSummaryCardsHtml(summary, units = "imperial") {
  const config = getFreightUnitConfig(units);
  return `
    <div class="admin-freight-summary">
      ${adminSummaryItem("Total handling units", String(summary.handlingUnits || 0))}
      ${adminSummaryItem("Total pieces", summary.totalPieces ? String(summary.totalPieces) : t("Unavailable"))}
      ${adminSummaryItem("Total weight", summary.totalWeight ? `${summary.totalWeight} ${config.totalWeightSummaryUnit}` : t("Unavailable"))}
      ${adminSummaryItem("Freight class", summary.freightClasses.length ? summary.freightClasses.join(", ") : t("Unavailable"))}
      ${adminSummaryItem("Distinct freight groups", String(summary.groupCount || 0))}
    </div>
  `;
}

function adminFreightTableHtml(rows, units = "imperial") {
  const config = getFreightUnitConfig(units);
  if (!rows.length) {
    return `<div class="empty-state">${escapeHtml(t("No freight details recorded."))}</div>`;
  }
  return `
    <div class="admin-table-scroll">
      <table class="admin-rate-table admin-freight-table">
        <thead>
          <tr>
            <th>${escapeHtml(t("Quantity"))}</th>
            <th>${escapeHtml(t("Packaging"))}</th>
            <th>${escapeHtml(t("Pieces"))}</th>
            <th>${escapeHtml(t("Dimensions"))}</th>
            <th>${escapeHtml(t("Weight each"))}</th>
            <th>${escapeHtml(t("Total weight"))}</th>
            <th>${escapeHtml(t("Freight class"))}</th>
            <th>${escapeHtml(t("Description"))}</th>
            <th>${escapeHtml(t("Stackable"))}</th>
            <th>${escapeHtml(t("Hazmat"))}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(String(row.quantity || t("Unavailable")))}</td>
              <td>${escapeHtml(formatPackagingLabel(row.type))}</td>
              <td>${escapeHtml(row.pieces || t("Unavailable"))}</td>
              <td>${escapeHtml([row.length, row.width, row.height].filter(Boolean).join(" x ") || t("Unavailable"))} ${[row.length, row.width, row.height].some(Boolean) ? escapeHtml(config.dimensionSummaryUnit) : ""}</td>
              <td>${escapeHtml(row.weight || t("Unavailable"))} ${row.weight ? escapeHtml(config.weightSummaryUnit) : ""}</td>
              <td>${row.totalWeight ? `${escapeHtml(String(row.totalWeight))} ${escapeHtml(config.totalWeightSummaryUnit)}` : escapeHtml(t("Unavailable"))}</td>
              <td>${escapeHtml(row.freightClass || t("Unavailable"))}</td>
              <td>${escapeHtml(row.description || t("Unavailable"))}</td>
              <td>${escapeHtml(row.stackable ? t("Yes") : t("No"))}</td>
              <td>${escapeHtml(row.hazmat ? t("Yes") : t("No"))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function adminTariffHtml(tariff) {
  if (!tariff.available) {
    return `<div class="admin-tariff-card"><small>${escapeHtml(t("Customer pricing rule"))}</small><strong>${escapeHtml(t("Pricing rule unavailable"))}</strong></div>`;
  }
  const value = tariff.labelKey === "Fixed markup"
    ? money.format(tariff.value)
    : `${tariff.value}%`;
  return `<div class="admin-tariff-card"><small>${escapeHtml(t("Customer pricing rule"))}</small><strong>${escapeHtml(t(tariff.labelKey))}: ${escapeHtml(value)}</strong></div>`;
}

function adminQuoteFinancialSummaryHtml(summary) {
  return `
    <section class="detail-section admin-quote-section">
      <h3>${escapeHtml(t("Pricing & Profit"))}</h3>
      <div class="admin-financial-grid">
        ${adminSummaryItem("Available Rates", String(summary.availableRates || 0))}
        ${adminSummaryItem("Lowest Carrier Cost", adminMoneyLabel(summary.lowestCarrierCost))}
        ${adminSummaryItem("Lowest Customer Price", adminMoneyLabel(summary.lowestCustomerPrice))}
        ${adminSummaryItem("Highest Gross Profit", adminMoneyLabel(summary.highestGrossProfit))}
      </div>
    </section>
  `;
}

function adminQuoteRateComparisonHtml(quote) {
  const controls = adminQuoteDetailsControls(quote.id);
  const sources = adminQuoteRateRows(quote, {
    quoteHasShipment: quoteHasShipment(quote, state.shipments),
    bookingAllowed: (sourceQuote, rate) => rateBookingAllowedForUser(sourceQuote, rate)
  })
    .map((row) => row.source)
    .filter(Boolean);
  const sourceOptions = ["all", ...Array.from(new Set(sources))];
  return `
    <section class="detail-section admin-quote-section admin-rate-section">
      <div class="admin-rate-toolbar">
        <div>
          <h3>${escapeHtml(t("Available Rates"))}</h3>
          <small data-admin-quote-rate-count="${escapeHtml(quote.id)}"></small>
        </div>
        <label>
          ${escapeHtml(t("Search carrier"))}
          <input type="search" value="${escapeHtml(controls.search)}" data-admin-quote-search="${escapeHtml(quote.id)}" placeholder="${escapeHtml(t("Search carrier"))}">
        </label>
        <label>
          ${escapeHtml(t("Channel"))}
          <select data-admin-quote-source-filter="${escapeHtml(quote.id)}">
            ${sourceOptions.map((source) => `<option value="${escapeHtml(source)}" ${controls.sourceFilter === source ? "selected" : ""}>${escapeHtml(source === "all" ? t("All Channels") : t(carrierModeSummaryLabel(source, false)))}</option>`).join("")}
          </select>
        </label>
        <label>
          ${escapeHtml(t("Sort"))}
          <select data-admin-quote-sort="${escapeHtml(quote.id)}">
            ${[
              ["customerPrice", "Lowest Customer Price"],
              ["carrierCost", "Lowest Carrier Cost"],
              ["grossProfit", "Highest Gross Profit"],
              ["margin", "Highest Margin"],
              ["transit", "Fastest Transit"],
              ["eta", "Earliest ETA"],
              ["carrierName", "Carrier Name"]
            ].map(([value, label]) => `<option value="${value}" ${controls.sort === value ? "selected" : ""}>${escapeHtml(t(label))}</option>`).join("")}
          </select>
        </label>
        <label class="admin-bookable-filter">
          <input type="checkbox" data-admin-quote-bookable-only="${escapeHtml(quote.id)}" ${controls.bookableOnly ? "checked" : ""}>
          ${escapeHtml(t("Bookable rates only"))}
        </label>
      </div>
      <div data-admin-quote-rate-list="${escapeHtml(quote.id)}"></div>
      <div class="rate-list-footer" data-admin-quote-rate-footer="${escapeHtml(quote.id)}"></div>
    </section>
  `;
}

function adminQuoteRateCollections(quote) {
  const controls = adminQuoteDetailsControls(quote?.id || "");
  const rows = adminQuoteRateRows(quote, {
    quoteHasShipment: quoteHasShipment(quote, state.shipments),
    bookingAllowed: (sourceQuote, rate) => rateBookingAllowedForUser(sourceQuote, rate)
  });
  const filteredRows = filterAdminQuoteRates(rows, controls);
  const sortedFilteredRows = sortAdminQuoteRates(filteredRows, controls.sort);
  const visibleRows = sortedFilteredRows.slice(0, controls.visibleCount);
  return {
    controls,
    rows,
    filteredRows,
    sortedFilteredRows,
    visibleRows
  };
}

function renderAdminQuoteRateResults(quote) {
  const collections = adminQuoteRateCollections(quote);
  const countText = adminQuoteRateCountText(collections);
  const listHtml = collections.visibleRows.length
    ? adminRateTableHtml(quote, collections.visibleRows)
    : `<div class="empty-state">${escapeHtml(collections.rows.length ? t("No rates match your filters.") : t("No rate details."))}</div>`;
  const footerHtml = collections.visibleRows.length < collections.sortedFilteredRows.length
    ? `<button class="secondary-action" type="button" data-admin-quote-load-more="${escapeHtml(quote.id)}">${t("Load More")}</button>`
    : "";
  return { countText, listHtml, footerHtml };
}

function adminQuoteRateCountText(collections) {
  if (collections.filteredRows.length !== collections.rows.length) {
    return t("Showing {visible} of {matching} matching rates · {total} total", {
      visible: collections.visibleRows.length,
      matching: collections.filteredRows.length,
      total: collections.rows.length
    });
  }
  return t("Showing {visible} of {total} rates", {
    visible: collections.visibleRows.length,
    total: collections.rows.length
  });
}

function adminRateTableHtml(quote, rows) {
  return `
    <div class="admin-table-scroll">
      <table class="admin-rate-table">
        <thead>
          <tr>
            <th>${escapeHtml(t("Carrier"))}</th>
            <th>${escapeHtml(t("Service"))}</th>
            <th>${escapeHtml(t("Channel"))}</th>
            <th>${escapeHtml(t("SCAC"))}</th>
            <th>${escapeHtml(t("Transit"))}</th>
            <th>${escapeHtml(t("ETA"))}</th>
            <th>${escapeHtml(t("Carrier Cost"))}</th>
            <th>${escapeHtml(t("Customer Price"))}</th>
            <th>${escapeHtml(t("Gross Profit"))}</th>
            <th>${escapeHtml(t("Margin"))}</th>
            <th>${escapeHtml(t("Booking"))}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => adminRateRowHtml(quote, row)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function adminRateRowHtml(quote, row) {
  return `
    <tr class="${row.financials.grossProfit < 0 ? "negative-margin-row" : ""}">
      <td>
        <strong>${escapeHtml(row.carrierName)}</strong>
        ${row.carrierQuoteId ? `<small>${escapeHtml(t("Offer"))} ${escapeHtml(row.carrierQuoteId)}</small>` : ""}
        <div class="admin-rate-badges">${adminRateBadgesHtml(row.badges)}</div>
      </td>
      <td>${escapeHtml(formatRateService(row.service))}</td>
      <td>${escapeHtml(t(row.channel))}</td>
      <td>${escapeHtml(row.scac || t("No SCAC"))}</td>
      <td>${Number.isFinite(row.transitDays) ? escapeHtml(formatTransitDays(row.transitDays)) : escapeHtml(t("Unavailable"))}</td>
      <td>${row.estimatedDeliveryDate ? escapeHtml(formatDate(row.estimatedDeliveryDate)) : escapeHtml(t("Unavailable"))}</td>
      <td>${escapeHtml(adminMoneyLabel(row.financials.carrierCost))}</td>
      <td>${escapeHtml(adminMoneyLabel(row.financials.customerPrice))}</td>
      <td>${escapeHtml(adminMoneyLabel(row.financials.grossProfit))}</td>
      <td>${Number.isFinite(row.financials.marginPercent) ? `${escapeHtml(String(row.financials.marginPercent))}%` : escapeHtml(t("Unavailable"))}</td>
      <td>${row.booking.bookable
        ? `<button class="primary-action rate-book-action" type="button" data-book-rate="${escapeHtml(row.id)}" data-book-quote="${escapeHtml(quote.id)}">${t("Book Shipment")}</button>`
        : `<span class="booking-disabled-note">${escapeHtml(t(row.booking.reason || "Booking unavailable"))}</span>`}
      </td>
    </tr>
  `;
}

function adminRateBadgesHtml(badges) {
  const labels = {
    lowestCustomerPrice: "Lowest Customer Price",
    lowestCarrierCost: "Lowest Carrier Cost",
    fastest: "Fastest",
    highestMargin: "Highest Margin",
    bookable: "Bookable",
    unavailable: "Booking Unavailable",
    negativeMargin: "Negative Margin"
  };
  return (Array.isArray(badges) ? badges : [])
    .map((badge) => `<span class="best-rate-badge ${badge === "negativeMargin" ? "warning-pill" : ""}">${escapeHtml(t(labels[badge] || badge))}</span>`)
    .join("");
}

function adminQuoteCarrierChannelsHtml(quote) {
  const channels = adminQuoteCarrierChannelRows(quote);
  if (!channels.length) {
    return `
      <section class="detail-section admin-quote-section">
        <h3>${escapeHtml(t("Carrier Channel Results"))}</h3>
        <div class="empty-state">${escapeHtml(t("No carrier channels recorded."))}</div>
      </section>
    `;
  }
  return `
    <section class="detail-section admin-quote-section">
      <h3>${escapeHtml(t("Carrier Channel Results"))}</h3>
      <div class="admin-channel-grid">
        ${channels.map((channel) => `
          <article class="admin-channel-card status-${escapeHtml(adminChannelStatusTone(channel.status))}">
            <strong>${escapeHtml(t(channel.channel))}</strong>
            <span>${escapeHtml(t(adminChannelStatusLabel(channel.status)))}</span>
            <small>${escapeHtml(t("{count} rate(s) returned", { count: channel.rateCount || 0 }))}</small>
            ${channel.carrierQuoteId ? `<small>${escapeHtml(t("Carrier quote ID"))}: ${escapeHtml(channel.carrierQuoteId)}</small>` : ""}
            ${channel.message ? `<p>${escapeHtml(channel.message)}</p>` : ""}
            <small>${escapeHtml(channel.onlineCarrierBookingSupported ? t("Online booking supported") : t("Online booking unavailable"))}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function adminQuoteDiagnosticsHtml(quote) {
  const rows = quoteAuditRows(quote);
  if (!rows.length) {
    return `
      <details class="detail-section admin-quote-section admin-diagnostics">
        <summary>${escapeHtml(t("Technical Diagnostics"))}</summary>
        <div class="empty-state audit-empty">${escapeHtml(t("No carrier audit data recorded for this quote."))}</div>
      </details>
    `;
  }
  return `
    <details class="detail-section admin-quote-section admin-diagnostics">
      <summary>${escapeHtml(t("Technical Diagnostics"))}</summary>
      <div class="audit-panel">
        ${rows.map((row, index) => adminDiagnosticEntryHtml(quote, row, index)).join("")}
      </div>
    </details>
  `;
}

function adminDiagnosticEntryHtml(quote, row, index) {
  const request = redactDiagnosticPayload(row.request);
  const response = redactDiagnosticPayload(row.response);
  const requestText = safeDiagnosticJson(request);
  const responseText = safeDiagnosticJson(response);
  const requestSafe = diagnosticPayloadIsSafe(request);
  const responseSafe = diagnosticPayloadIsSafe(response);
  return `
    <details class="audit-entry admin-diagnostic-entry">
      <summary>
        <span>${escapeHtml(t(carrierModeSummaryLabel(row.mode || row.carrier || quote.carrierMode, false)))}</span>
        <span class="audit-summary-meta">
          ${row.rateCount ? `${escapeHtml(String(row.rateCount))} ${escapeHtml(t("rate(s)"))}` : escapeHtml(t("No rates"))}
          ${row.carrierQuoteId ? ` · ${escapeHtml(row.carrierQuoteId)}` : ""}
        </span>
      </summary>
      <div class="audit-entry-body">
        ${row.carrierMessage || row.message ? `<p class="audit-message">${escapeHtml(row.carrierMessage || row.message)}</p>` : ""}
        <div class="audit-grid">
          <div class="audit-block">
            <div class="audit-block-heading">
              <strong>${escapeHtml(t("Outbound request"))}</strong>
              <button class="secondary-action compact-action" type="button" data-copy-sanitized-diagnostic ${requestSafe ? "" : "disabled aria-disabled=\"true\""}>${escapeHtml(t("Copy Sanitized Request"))}</button>
            </div>
            <pre class="audit-json" data-diagnostic-safe="${requestSafe ? "true" : "false"}">${escapeHtml(requestText)}</pre>
          </div>
          <div class="audit-block">
            <div class="audit-block-heading">
              <strong>${escapeHtml(t("Carrier response"))}</strong>
              <button class="secondary-action compact-action" type="button" data-copy-sanitized-diagnostic ${responseSafe ? "" : "disabled aria-disabled=\"true\""}>${escapeHtml(t("Copy Sanitized Response"))}</button>
            </div>
            <pre class="audit-json" data-diagnostic-safe="${responseSafe ? "true" : "false"}">${escapeHtml(responseText)}</pre>
          </div>
        </div>
      </div>
    </details>
  `;
}

function bookingConfirmationHtml(quote, rate) {
  const customerView = isCustomerUser();
  if (customerView) {
    return customerBookingConfirmationHtml(quote, rate);
  }
  return staffBookingConfirmationHtml(quote, rate);
}

function carrierBookingBlockedByValidation(quote, rate) {
  const purchaseSummary = summarizeMothershipPurchaseMetadata(mothershipPurchaseMetadata(quote, rate));
  return Boolean(purchaseSummary && purchaseSummary.purchasable === false);
}

function customerBookingConfirmationHtml(quote, rate) {
  const bookingBlocked = carrierBookingBlockedByValidation(quote, rate);
  const price = validSellPrice(rate);
  return `
    <div class="booking-confirmation">
      <div class="quote-status notice-state ${bookingBlocked ? "" : "success-state"}">
        <strong>${t("Confirm shipment booking")}</strong>
        <p>${t("This will submit the selected rate for shipment booking. Please confirm before continuing.")}</p>
      </div>
      <div class="quote-status notice-state ${bookingBlocked ? "" : "success-state"}">
        <strong>${t("Booking status")}</strong>
        <p>${bookingBlocked
          ? escapeHtml(t("This rate cannot be booked online. Please choose another rate or contact customer service."))
          : escapeHtml(t("Ready for online booking."))}</p>
      </div>
      <div class="confirmation-grid">
        <div>
          <small>${t("Carrier")}</small>
          <strong>${escapeHtml(carrierNameLabel(rate, quote, true))}</strong>
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
          <small>${t("Your Price")}</small>
          <strong>${Number.isFinite(price) ? money.format(price) : escapeHtml(t("Price unavailable"))}</strong>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary-action" data-cancel-booking>${t("Cancel")}</button>
        <button type="button" class="primary-action" data-confirm-booking ${bookingBlocked ? "disabled" : ""}>${t("Confirm Booking")}</button>
      </div>
    </div>
  `;
}

function staffBookingConfirmationHtml(quote, rate) {
  const customerView = false;
  const isCarrierBooking = rate?.carrierSource === "mothershipSandbox";
  const purchaseSummary = summarizeMothershipPurchaseMetadata(mothershipPurchaseMetadata(quote, rate));
  const bookingBlocked = Boolean(purchaseSummary && purchaseSummary.purchasable === false);
  const financials = adminRateFinancials(rate);
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
          <small>${t("Carrier Cost")}</small>
          <strong>${escapeHtml(adminMoneyLabel(financials.carrierCost))}</strong>
        </div>
        <div>
          <small>${t("Customer Price")}</small>
          <strong>${escapeHtml(adminMoneyLabel(financials.customerPrice))}</strong>
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
  const statusPill = isCustomerUser()
    ? customerShipmentStatusBadgeHtml(shipment.status)
    : shipment.status === "booked_with_carrier" ? "" : `<span class="pill">${escapeHtml(shipment.status)}</span>`;
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
    if (customerView && (explicitName === "Self-owned Truck" || explicitName === "Contracted Carrier")) {
      return t(explicitName);
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
  const carrierPreferenceSelect = document.getElementById("carrierPreferenceCustomerSelect");
  if (carrierPreferenceSelect) {
    const previousCarrierPreferenceCustomerId = carrierPreferenceSelect.value || "";
    carrierPreferenceSelect.innerHTML = options;
    if (previousCarrierPreferenceCustomerId && state.customers.some((customer) => customer.id === previousCarrierPreferenceCustomerId)) {
      carrierPreferenceSelect.value = previousCarrierPreferenceCustomerId;
    }
    if (!carrierPreferenceSelect.dataset.preferenceBound) {
      carrierPreferenceSelect.addEventListener("change", () => refreshCarrierPreferences());
      carrierPreferenceSelect.dataset.preferenceBound = "true";
    }
  }
  syncCarrierControls();
  updateFreightClassSuggestion();
}

async function refreshCarrierPreferences(options = {}) {
  if (!isStaffUser()) {
    state.carrierPreferences = [];
    renderCarrierPreferences();
    return;
  }
  const customerId = state.customerManagement.selectedCustomerId || "";
  if (!customerId) {
    state.carrierPreferences = [];
    renderCarrierPreferences();
    return;
  }
  try {
    state.customerManagement.blockedCarrierLoading = true;
    const response = await api(`/api/carrier-preferences?customerId=${encodeURIComponent(customerId)}`);
    state.carrierPreferences = response.preferences || [];
    renderCarrierPreferences();
  } catch (error) {
    state.carrierPreferences = [];
    renderCarrierPreferences();
    if (!options.silent) {
      showToast(error.message, true);
    }
  } finally {
    state.customerManagement.blockedCarrierLoading = false;
    renderCarrierPreferences();
  }
}

function renderCarrierPreferences() {
  const list = document.getElementById("carrierPreferenceList");
  if (!list) {
    return;
  }
  if (!isStaffUser()) {
    list.innerHTML = "";
    return;
  }
  const isView = state.customerManagement.drawerMode === "view";
  if (state.customerManagement.blockedCarrierLoading) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(t("Blocked carriers are loading..."))}</div>`;
    return;
  }
  if (state.carrierPreferences.length === 0) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(t("No blocked carriers."))}</div>`;
    return;
  }
  list.innerHTML = state.carrierPreferences
    .map((preference) => `
      <article class="blocked-carrier-row">
        <div>
          <strong>${escapeHtml(preference.carrierName || preference.carrierKey)}</strong>
          <small>${escapeHtml(preference.carrierKey)}</small>
          ${preference.reason ? `<p>${escapeHtml(preference.reason)}</p>` : ""}
        </div>
        ${isView ? "" : `<button class="danger-action" type="button" data-delete-carrier-preference="${escapeHtml(preference.id)}">${t("Remove")}</button>`}
      </article>
    `)
    .join("");
}

async function deleteCarrierPreference(id) {
  if (!isStaffUser()) {
    return;
  }
  const customerId = state.customerManagement.selectedCustomerId || "";
  await api(`/api/carrier-preferences/${encodeURIComponent(id)}?customerId=${encodeURIComponent(customerId)}`, {
    method: "DELETE"
  });
  showToast(t("Blocked carrier removed."));
  await refreshCarrierPreferences();
  renderCustomerManagementDrawer();
}

function renderCustomers(options = {}) {
  const list = document.getElementById("customerList");
  const filters = document.getElementById("customerManagementFilters");
  const metrics = document.getElementById("customerManagementMetrics");
  if (!list || !filters || !metrics) {
    return;
  }
  if (!isStaffUser()) {
    list.innerHTML = "";
    filters.innerHTML = "";
    metrics.innerHTML = "";
    return;
  }
  renderCustomerManagementControls(options);
  renderCustomerManagementMetrics();
  renderCustomerManagementList();
}

function customerManagementCurrentViewModel() {
  const cm = state.customerManagement;
  return customerManagementViewModel({
    customers: state.customers,
    tariffs: state.tariffs,
    quotes: state.quotes,
    shipments: state.shipments,
    query: cm.query,
    statusFilter: cm.statusFilter,
    configurationFilter: cm.configurationFilter,
    sort: cm.sort
  });
}

function renderCustomerManagementControls(options = {}) {
  const filters = document.getElementById("customerManagementFilters");
  if (!filters) return;
  if (!isStaffUser()) {
    filters.innerHTML = "";
    return;
  }
  if (options.forceControls || !filters.hasChildNodes()) {
    filters.innerHTML = customerManagementFilterHtml();
    return;
  }
  const queryInput = filters.querySelector("[data-customer-management-query]");
  if (queryInput && queryInput.value !== state.customerManagement.query) {
    queryInput.value = state.customerManagement.query;
  }
  filters.querySelectorAll("[data-customer-management-filter]").forEach((select) => {
    const key = select.dataset.customerManagementFilter;
    if (key && select.value !== state.customerManagement[key]) {
      select.value = state.customerManagement[key];
    }
  });
}

function renderCustomerManagementMetrics() {
  const metrics = document.getElementById("customerManagementMetrics");
  if (!metrics) return;
  if (!isStaffUser()) {
    metrics.innerHTML = "";
    return;
  }
  metrics.innerHTML = customerManagementMetricHtml(customerManagementCurrentViewModel().metrics);
}

function renderCustomerManagementList() {
  const list = document.getElementById("customerList");
  if (!list) return;
  if (!isStaffUser()) {
    list.innerHTML = "";
    return;
  }
  const viewModel = customerManagementCurrentViewModel();

  if (state.customers.length === 0) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(t("No customers yet."))}</div>`;
    return;
  }
  if (viewModel.rows.length === 0) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(t("No customers match your search or filters."))}</div>`;
    return;
  }

  list.innerHTML = viewModel.rows
    .map(customerManagementCardHtml)
    .join("");
}

function customerManagementFilterHtml() {
  const cm = state.customerManagement;
  const statusOptions = [
    ["all", "All"],
    ["active", "account.status.active"],
    ["disabled", "account.status.disabled"]
  ];
  const configurationOptions = [
    ["all", "All"],
    ["missingTariff", "Missing Tariff"],
    ["noCarrierModes", "No Carrier Modes"],
    ["onlineBookingDisabled", "Online Booking Disabled"],
    ["portalNotConfigured", "Portal Not Configured"],
    ["configurationComplete", "Configuration complete"]
  ];
  const sortOptions = [
    ["recent", "Recently Updated"],
    ["company", "Company Name"],
    ["quotes", "Most Quotes"],
    ["shipments", "Most Shipments"]
  ];
  return `
    <label class="customer-management-search">
      <span class="sr-only">${escapeHtml(t("Search"))}</span>
      <input type="search" data-customer-management-query value="${escapeHtml(cm.query)}" placeholder="${escapeHtml(t("Search customers..."))}">
    </label>
    ${customerManagementSelectHtml("statusFilter", "Status", statusOptions, cm.statusFilter)}
    ${customerManagementSelectHtml("configurationFilter", "Configuration", configurationOptions, cm.configurationFilter)}
    ${customerManagementSelectHtml("sort", "Sort", sortOptions, cm.sort)}
  `;
}

function customerManagementSelectHtml(name, label, options, value) {
  return `
    <label>
      <span>${escapeHtml(t(label))}</span>
      <select data-customer-management-filter="${escapeHtml(name)}">
        ${options.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}" ${value === optionValue ? "selected" : ""}>${escapeHtml(t(optionLabel))}</option>`).join("")}
      </select>
    </label>
  `;
}

function customerManagementMetricHtml(metrics) {
  return [
    ["Total Customers", metrics.totalCustomers],
    ["Configuration Incomplete", metrics.configurationIncomplete],
    ["Online booking enabled", metrics.onlineBookingEnabled]
  ].map(([label, value]) => `
    <div class="customer-management-metric">
      <span>${escapeHtml(t(label))}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `).join("");
}

function customerManagementCardHtml(row) {
  const customer = row.customer;
  const statusLabel = t(customerStatusLabelKey(customer));
  const address = [customer.companyStreet, customer.companyCity, customer.companyState, customer.companyZip].filter(Boolean).join(", ");
  const quoteModes = normalizeAllowedCarrierModes(customer.allowedCarrierModes || [], []);
  const bookingModes = customerExplicitBookingModes(customer);
  const pricing = customerPricingLine(row.pricing);
  const statusAction = normalizeCustomerAccountStatus(customer.status) === "disabled" ? "Enable" : "Disable";
  return `
    <article class="customer-management-card" data-customer-card="${escapeHtml(customer.id)}">
      <div class="customer-card-main">
        <div class="customer-management-title-row">
          <h3>${escapeHtml(customer.companyName || t("Customer"))}</h3>
          <span class="pill">${escapeHtml(statusLabel)}</span>
        </div>
        <p>${escapeHtml([customer.billingEmail || t("No billing email"), customer.paymentTerms || "Net 15"].filter(Boolean).join(" · "))}</p>
        ${address ? `<p>${escapeHtml(address)}</p>` : ""}
        <div class="customer-management-details">
          ${customerManagementDetail("Quote channels", quoteModes.length ? customerManagementCarrierModeListLabel(quoteModes) : t("No Carrier Modes"))}
          ${customerManagementDetail("customerManagement.onlineBooking", bookingModes.length ? customerManagementCarrierModeListLabel(bookingModes) : t("Not enabled"))}
          ${customerManagementDetail("Pricing rule", pricing)}
          ${customerManagementDetail("Last 30 days", `${t("{count} quotes", { count: row.activity.quotesLast30 })} · ${t("{count} shipments", { count: row.activity.shipmentsLast30 })}`)}
        </div>
      </div>
      <div class="customer-management-card-actions">
        <button class="secondary-action" type="button" data-customer-management-view="${escapeHtml(customer.id)}">${escapeHtml(t("View Details"))}</button>
        <button class="secondary-action" type="button" data-customer-management-edit="${escapeHtml(customer.id)}">${escapeHtml(t("Edit"))}</button>
        <details class="customer-more-menu">
          <summary>${escapeHtml(t("More"))}</summary>
          <div class="customer-more-menu-panel">
            <button type="button" data-toggle-customer-status="${escapeHtml(customer.id)}">${escapeHtml(t(statusAction))}</button>
            <button type="button" class="danger-link" data-delete-customer="${escapeHtml(customer.id)}">${escapeHtml(t("Delete Customer"))}</button>
          </div>
        </details>
      </div>
    </article>
  `;
}

function customerManagementDetail(label, value) {
  return `
    <div>
      <small>${escapeHtml(t(label))}</small>
      <strong>${escapeHtml(value || t("N/A"))}</strong>
    </div>
  `;
}

function customerPricingLine(pricing) {
  if (!pricing?.hasRule) {
    return t("no tariff");
  }
  if (pricing.ruleType === "fixed") {
    return `${t("Fixed markup")}: ${money.format(Number(pricing.value || 0))}`;
  }
  return `${t("Percentage markup")}: ${Number(pricing.value || 0)}%`;
}

function customerManagementCarrierModeListLabel(modes) {
  return normalizeAllowedCarrierModes(modes, [])
    .map((mode) => t(carrierModeSummaryLabel(mode, false)))
    .join(" · ");
}

function renderDashboard() {
  if (isCustomerUser()) {
    renderCustomerDashboard();
    return;
  }

  renderStaffDashboard();
}

function renderQuotesView() {
  const list = document.getElementById("quoteList");
  if (!list) {
    return;
  }
  if (!isCustomerUser()) {
    const activeFilter = state.staffFilters.quotes || "all";
    const activeRange = state.staffFilterRanges.quotes || "all";
    const filters = [
      { value: "all", label: "All" },
      { value: "today", label: "Today" },
      { value: "ready", label: "Ready to Book" },
      { value: "noRates", label: "No Rates" },
      { value: "customerPreferences", label: "Customer Preferences" },
      { value: "partialFailure", label: "Partial Failure" },
      { value: "failed", label: "Failed" },
      { value: "booked", label: "Booked" },
      { value: "expired", label: "Expired" }
    ];
    const quotes = recentByCreatedAt(state.quotes).filter((quote) =>
      adminQuoteMatchesFilter(quote, activeFilter, state.shipments) &&
      adminRecordMatchesDateRange(quote, activeRange)
    );
    list.innerHTML = `
      ${staffFilterBarHtml("quotes", filters, activeFilter, activeRange)}
      <div class="staff-card-stack">
        ${quotes.length ? quotes.map(staffQuoteRowHtml).join("") : `<div class="empty-state">${escapeHtml(t("No filter results."))}</div>`}
      </div>
    `;
    return;
  }
  const activeFilter = state.customerFilters.quotes || "all";
  const filters = [
    { value: "all", label: "All" },
    { value: "ready", label: "Ready to Book" },
    { value: "booked", label: "Booked" },
    { value: "noRates", label: "No Rates" },
    { value: "expired", label: "Expired" }
  ];
  const quotes = recentByCreatedAt(state.quotes).filter((quote) => customerQuoteMatchesFilter(quote, activeFilter));
  list.innerHTML = `
    ${customerFilterBarHtml("quotes", filters, activeFilter)}
    <div class="customer-card-stack">
      ${quotes.length ? quotes.map(customerQuoteRowHtml).join("") : `<div class="empty-state">${t("No quotes yet. Create your first quote.")}</div>`}
    </div>
  `;
}

function renderStaffDashboard() {
  const dashboard = document.getElementById("dashboardView");
  if (!dashboard) {
    return;
  }
  dashboard.classList.remove("customer-dashboard-view");
  dashboard.classList.add("staff-dashboard-view");
  if (state.dashboardLoading && !state.lastSuccessfulRefreshAt && !state.quotes.length && !state.shipments.length && !state.invoices.length) {
    dashboard.innerHTML = `<div class="staff-dashboard-shell"><div class="empty-state" aria-live="polite">${t("Loading operations dashboard...")}</div></div>`;
    return;
  }
  dashboard.innerHTML = staffDashboardShellHtml();
}

function staffDashboardShellHtml() {
  const data = adminDashboardData();
  const checklist = adminSetupChecklist({
    customers: state.customers,
    tariffs: state.tariffs,
    quotes: state.quotes,
    health: state.health
  });
  return `
    <div class="staff-dashboard-shell">
      ${state.dashboardError ? `<div class="quote-status notice-state" role="alert">${escapeHtml(state.dashboardError)}</div>` : ""}
      <section class="staff-dashboard-header">
        <div>
          <p class="eyebrow">${escapeHtml(t("Operations Overview"))}</p>
          <h2>${escapeHtml(t("Monitor quotes, shipments, customers, invoices, and carrier activity."))}</h2>
          ${state.lastSuccessfulRefreshAt ? `<small>${escapeHtml(t("Last updated {time}", { time: formatDateTime(state.lastSuccessfulRefreshAt) }))}</small>` : ""}
        </div>
        <div class="staff-dashboard-actions">
          <button class="primary-action" type="button" data-staff-dashboard-action="newQuote">${t("+ New Quote")}</button>
          <button class="secondary-action" type="button" data-staff-dashboard-action="search">${t("Search")}</button>
          <label class="staff-range-control">
            <span>${escapeHtml(t("Date Range"))}</span>
            <select data-staff-dashboard-range>
              ${staffDateRangeOptionsHtml()}
            </select>
          </label>
        </div>
      </section>
      ${staffKpiGridHtml(data.metrics)}
      <div class="staff-dashboard-row staff-dashboard-row-main">
        ${staffAttentionHtml(data.attentionItems)}
        ${checklist.remaining.length ? staffSetupChecklistHtml(checklist) : staffCarrierChannelsHtml(data.carrierChannels)}
      </div>
      <div class="staff-dashboard-row">
        ${staffConversionHtml(data.conversion)}
        ${staffCustomerOverviewHtml(data.customerOverview)}
      </div>
      ${checklist.remaining.length ? `<div class="staff-dashboard-row">${staffCarrierChannelsHtml(data.carrierChannels)}</div>` : ""}
      ${staffRecentActivityHtml(data.activity)}
    </div>
  `;
}

function adminDashboardData() {
  const now = new Date();
  const data = {
    quotes: state.quotes,
    shipments: state.shipments,
    invoices: state.invoices,
    customers: state.customers,
    tariffs: state.tariffs
  };
  return {
    metrics: adminDashboardMetrics(data, state.staffDashboardRange, now),
    attentionItems: adminAttentionItems(data, state.staffDashboardRange, now),
    conversion: adminQuoteConversion(data, state.staffDashboardRange, now),
    activity: adminRecentActivity(data, state.staffDashboardRange, now),
    customerOverview: adminCustomerOverview(data, state.staffDashboardRange, now),
    carrierChannels: adminCarrierChannels(state.health || {}, state.quotes)
  };
}

function staffDateRangeOptionsHtml() {
  return [
    ["today", "Today"],
    ["last7", "Last 7 Days"],
    ["last30", "Last 30 Days"],
    ["all", "All Time"]
  ].map(([value, label]) => `<option value="${value}" ${state.staffDashboardRange === value ? "selected" : ""}>${escapeHtml(t(label))}</option>`).join("");
}

function staffKpiGridHtml(metrics) {
  const cards = [
    { key: "quotesCreated", label: "Quotes Created", count: metrics.quotesCreated, helper: "Created during the selected period.", filter: "quotesCreated", action: "View quotes", state: "blue" },
    { key: "readyToBook", label: "Ready to Book", count: metrics.readyToBook, helper: "Rates available and awaiting booking.", filter: "readyQuotes", action: "View quotes", state: "green" },
    { key: "quoteIssues", label: "Quote Issues", count: metrics.quoteIssues, helper: "No-rate or carrier-response issues.", filter: "quoteIssues", action: "View quotes", state: "amber" },
    { key: "activeShipments", label: "Active Shipments", count: metrics.activeShipments, helper: "Booked or currently moving.", filter: "activeShipments", action: "View shipments", state: "blue" },
    { key: "shipmentExceptions", label: "Shipment Exceptions", count: metrics.shipmentExceptions, helper: "Shipments requiring operational review.", filter: "shipmentExceptions", action: "View shipments", state: "red" },
    { key: "openInvoices", label: "Open Invoices", count: metrics.openInvoices, helper: "Draft, unpaid, due, or overdue.", filter: "openInvoices", action: "View invoices", state: "amber" }
  ];
  return `
    <section class="staff-kpi-grid" aria-label="${escapeHtml(t("Operations Overview"))}">
      ${cards.map((card) => `
        <button class="staff-kpi-card staff-kpi-${card.state}" type="button" data-dashboard-filter="${escapeHtml(card.filter)}">
          <span>${escapeHtml(t(card.label))}</span>
          <strong>${escapeHtml(String(card.count))}</strong>
          <small>${escapeHtml(t(card.helper))}</small>
          <em>${escapeHtml(t(card.action))} →</em>
        </button>
      `).join("")}
    </section>
  `;
}

function staffAttentionHtml(items) {
  const preview = items.slice(0, 5);
  return `
    <section class="panel staff-panel staff-attention-panel">
      <div class="panel-heading">
        <h2>${escapeHtml(t("Needs Attention"))}</h2>
      </div>
      <div class="staff-card-stack">
        ${preview.length ? preview.map(staffAttentionItemHtml).join("") : `<div class="empty-state">${escapeHtml(t("No urgent items require attention."))}</div>`}
      </div>
    </section>
  `;
}

function staffAttentionItemHtml(item) {
  const action = staffActionForAttention(item);
  return `
    <article class="staff-attention-item severity-${escapeHtml(staffSeverityForPriority(item.priority))}">
      <span class="attention-marker" aria-hidden="true">${escapeHtml(staffSeverityLabel(item.priority))}</span>
      <div>
        <strong>${escapeHtml(item.customerName)}</strong>
        <small>${escapeHtml(item.recordNumber || item.recordId || "")} · ${escapeHtml(t(item.reason))}${item.date ? ` · ${escapeHtml(formatDateTime(item.date))}` : ""}</small>
      </div>
      <button class="link-action" type="button" ${action.attrs}>${escapeHtml(t(action.label))} →</button>
    </article>
  `;
}

function staffActionForAttention(item) {
  if (String(item.type).startsWith("shipment")) {
    return { label: "View Shipment", attrs: `data-view-shipment="${escapeHtml(item.recordId || "")}"` };
  }
  if (String(item.type).startsWith("invoice")) {
    return { label: "View Invoice", attrs: `data-view-invoice="${escapeHtml(item.recordId || "")}"` };
  }
  if (String(item.type).startsWith("customer")) {
    return { label: "Customer Management", attrs: `data-staff-dashboard-action="customers"` };
  }
  return { label: "View Quote", attrs: `data-view-quote="${escapeHtml(item.recordId || "")}"` };
}

function staffSeverityForPriority(priority) {
  if (priority <= 2) return "red";
  if (priority <= 5) return "amber";
  return "blue";
}

function staffSeverityLabel(priority) {
  if (priority <= 2) return "!";
  if (priority <= 5) return "Review";
  return "Info";
}

function staffConversionHtml(conversion) {
  const steps = [
    ["Quotes Created", conversion.quotesCreated],
    ["Quotes With Rates", conversion.quotesWithRates],
    ["Ready to Book", conversion.readyToBook],
    ["Booked Shipments", conversion.bookedShipments],
    ["Delivered Shipments", conversion.deliveredShipments]
  ];
  const max = Math.max(...steps.map(([, count]) => count), 1);
  return `
    <section class="panel staff-panel">
      <div class="panel-heading">
        <h2>${escapeHtml(t("Quote Conversion"))}</h2>
      </div>
      <div class="conversion-steps">
        ${steps.map(([label, count]) => `
          <div class="conversion-step">
            <div><strong>${escapeHtml(String(count))}</strong><span>${escapeHtml(t(label))}</span></div>
            <span class="conversion-bar"><i style="width:${Math.round((count / max) * 100)}%"></i></span>
          </div>
        `).join("")}
      </div>
      <div class="customer-safe-meta">
        <span>${escapeHtml(t("Quote success rate"))}: ${formatPercent(conversion.quoteSuccessRate)}</span>
        <span>${escapeHtml(t("Quote-to-booking conversion"))}: ${formatPercent(conversion.quoteToBookingRate)}</span>
      </div>
    </section>
  `;
}

function staffCarrierChannelsHtml(channels) {
  return `
    <section class="panel staff-panel staff-carrier-panel">
      <div class="panel-heading">
        <h2>${escapeHtml(t("Carrier Channels"))}</h2>
        <button class="link-action" type="button" data-staff-dashboard-action="diagnostics">${escapeHtml(t("View diagnostics"))}</button>
      </div>
      <div class="staff-card-stack">
        ${channels.map((channel) => `
          <article class="carrier-channel-card">
            <div>
              <strong>${escapeHtml(channel.name)}</strong>
              <small>${escapeHtml(t(channel.configured === "configured" ? "Configured" : channel.configured === "not_configured" ? "Not Configured" : "Unknown"))}</small>
            </div>
            <span class="status-badge status-${escapeHtml(channel.health === "error" ? "red" : channel.health === "healthy" ? "green" : channel.health === "degraded" ? "amber" : "neutral")}">${escapeHtml(t(channel.health === "healthy" ? "Healthy" : channel.health === "degraded" ? "Degraded" : channel.health === "error" ? "Error" : "Unknown"))}</span>
            ${typeof channel.bookingEnabled === "boolean" ? `<small>${escapeHtml(t(channel.bookingEnabled ? "Booking enabled" : "Booking disabled"))}</small>` : ""}
            ${channel.lastSuccessfulQuoteAt ? `<small>${escapeHtml(t("Last successful quote {time}", { time: formatDateTime(channel.lastSuccessfulQuoteAt) }))}</small>` : ""}
            ${channel.lastErrorSummary ? `<small>${escapeHtml(t("Last error: {message}", { message: channel.lastErrorSummary }))}</small>` : ""}
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function staffSetupChecklistHtml(checklist) {
  return `
    <section class="panel staff-panel staff-setup-panel">
      <div class="panel-heading">
        <h2>${escapeHtml(t("System Setup"))}</h2>
        <span class="pill">${escapeHtml(t("{completed} of {total} setup steps completed", { completed: checklist.completed, total: checklist.total }))}</span>
      </div>
      <div class="staff-card-stack">
        ${checklist.remaining.map((item) => `<article class="setup-item"><span class="attention-marker" aria-hidden="true">!</span><span>${escapeHtml(t(item.label))}</span></article>`).join("")}
      </div>
    </section>
  `;
}

function staffCustomerOverviewHtml(overview) {
  const rows = [
    ["Active customers", overview.activeCustomers],
    ["Disabled customers", overview.disabledCustomers],
    ["Missing tariff rules", overview.missingTariffRules],
    ["Without carrier modes", overview.withoutCarrierModes],
    ["Online booking enabled", overview.onlineBookingEnabled],
    ["No quote activity", overview.noQuoteActivity]
  ];
  return `
    <section class="panel staff-panel">
      <div class="panel-heading">
        <h2>${escapeHtml(t("Customer Overview"))}</h2>
        <button class="link-action" type="button" data-staff-dashboard-action="customers">${escapeHtml(t("Customer Management"))}</button>
      </div>
      <div class="customer-overview-grid">
        ${rows.map(([label, count]) => `<div><small>${escapeHtml(t(label))}</small><strong>${escapeHtml(String(count))}</strong></div>`).join("")}
      </div>
      ${overview.needsConfiguration.length ? `
        <div class="staff-card-stack compact-stack">
          <strong>${escapeHtml(t("Customers requiring configuration"))}</strong>
          ${overview.needsConfiguration.map((customer) => `<button class="link-action" type="button" data-staff-dashboard-action="customers">${escapeHtml(customer.companyName || customer.name || customer.id)}</button>`).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function staffRecentActivityHtml(activity) {
  return `
    <section class="panel staff-panel staff-recent-activity">
      <div class="panel-heading">
        <h2>${escapeHtml(t("Recent Activity"))}</h2>
      </div>
      <div class="staff-card-stack">
        ${activity.slice(0, 10).length ? activity.slice(0, 10).map(staffActivityItemHtml).join("") : `<div class="empty-state">${escapeHtml(t("No recent operational activity."))}</div>`}
      </div>
    </section>
  `;
}

function staffActivityItemHtml(item) {
  return `
    <article class="staff-activity-item">
      <small>${escapeHtml(formatDateTime(item.date))}</small>
      <strong>${escapeHtml(t(staffActivityTypeLabel(item.type)))}</strong>
      <span>${escapeHtml(item.customerName)} · ${escapeHtml(item.recordNumber || item.recordId || "")}</span>
      <p>${escapeHtml(t(item.detail))}</p>
      <button class="link-action" type="button" ${staffActivityActionAttrs(item)}>${escapeHtml(t("View Details"))} →</button>
    </article>
  `;
}

function staffActivityTypeLabel(type) {
  return {
    quote_created: "Quote created",
    shipment_updated: "Shipment status updated",
    invoice_created: "Invoice created/imported",
    customer_created: "Customer created",
    customer_updated: "Customer updated"
  }[type] || "Recent Activity";
}

function staffActivityActionAttrs(item) {
  if (String(item.type).startsWith("quote")) return `data-view-quote="${escapeHtml(item.recordId || "")}"`;
  if (String(item.type).startsWith("shipment")) return `data-view-shipment="${escapeHtml(item.recordId || "")}"`;
  if (String(item.type).startsWith("invoice")) return `data-view-invoice="${escapeHtml(item.recordId || "")}"`;
  return `data-staff-dashboard-action="customers"`;
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "N/A";
}

function staffFilterBarHtml(view, filters, activeFilter, activeRange = "all") {
  const activeLabel = filters.find((filter) => filter.value === activeFilter)?.label || "All";
  const rangeLabel = staffDateRangeLabel(activeRange);
  const hasStatusFilter = activeFilter !== "all";
  const hasRangeFilter = activeRange !== "all";
  return `
    <div class="customer-filter-bar staff-filter-bar" aria-label="${escapeHtml(t("Filter: {filter}", { filter: t(filters.find((filter) => filter.value === activeFilter)?.label || "All") }))}">
      <span class="staff-filter-summary">${escapeHtml(`${t(activeLabel)} · ${t(rangeLabel)}`)}</span>
      ${filters.map((filter) => `
        <button class="filter-chip ${activeFilter === filter.value ? "active" : ""}" type="button" data-staff-filter-view="${escapeHtml(view)}" data-staff-filter="${escapeHtml(filter.value)}">
          ${escapeHtml(t(filter.label))}
        </button>
      `).join("")}
      ${hasStatusFilter ? `<button class="link-action" type="button" data-staff-filter-view="${escapeHtml(view)}" data-staff-filter="all">${escapeHtml(t("Clear status"))}</button>` : ""}
      ${hasRangeFilter ? `<button class="link-action" type="button" data-staff-clear-date-range="${escapeHtml(view)}">${escapeHtml(t("Clear date range"))}</button>` : ""}
      ${hasStatusFilter || hasRangeFilter ? `<button class="link-action" type="button" data-staff-clear-all-filters="${escapeHtml(view)}">${escapeHtml(t("Clear all filters"))}</button>` : ""}
    </div>
  `;
}

function staffDateRangeLabel(range) {
  return {
    today: "Today",
    last7: "Last 7 Days",
    last30: "Last 30 Days",
    all: "All Time"
  }[range] || "All Time";
}

function staffQuoteRowHtml(quote) {
  const customer = customerById(quote.customerId);
  const usableRateCount = countUsableRates(quote);
  const lowest = lowestUsableSellPrice(quote);
  return `
    <article class="customer-quote-row staff-quote-row">
      <div class="customer-quote-content">
        <div class="customer-quote-title-row">
          <strong>${escapeHtml(t("Quote {quoteNumber}", { quoteNumber: customerQuoteNumber(quote) }))}</strong>
          ${staffQuoteStatusBadgeHtml(quote)}
        </div>
        <p class="customer-quote-route">${escapeHtml(customer?.companyName || customer?.name || t("Unknown"))} · ${escapeHtml(routeLabel(quote.pickup, quote.delivery))}</p>
        <div class="customer-quote-meta">
          <span>${escapeHtml(formatDateTime(quote.createdAt))}</span>
          <span>${escapeHtml(t("Reference / PO"))}: ${escapeHtml(quote.referenceNumber || "N/A")}</span>
          <span>${escapeHtml(String(usableRateCount))} ${escapeHtml(t("usable rate(s)"))}</span>
          <span>${escapeHtml(t("Lowest price"))}: ${Number.isFinite(lowest) ? money.format(lowest) : escapeHtml(t("No Rates"))}</span>
          <span>${staffCarrierAuditSummaryLabel(quote)}</span>
        </div>
      </div>
      <div class="row-actions">
        <button class="secondary-action" type="button" data-view-quote="${escapeHtml(quote.id)}">${escapeHtml(t("View Details"))}</button>
        <button class="secondary-action" type="button" data-reenter-quote="${escapeHtml(quote.id)}">${escapeHtml(t("Repeat Quote"))}</button>
      </div>
    </article>
  `;
}

function staffQuoteStatusBadgeHtml(quote) {
  const label = staffQuoteStatusLabel(quote);
  const variant = {
    "Ready to Book": "blue",
    "No Rates": "neutral",
    "Partial Failure": "amber",
    "Filtered by Customer Preferences": "neutral",
    Failed: "red",
    Cancelled: "gray",
    Booked: "green",
    Expired: "gray",
    "Status Pending": "neutral"
  }[label] || "neutral";
  return `<span class="status-badge status-${escapeHtml(variant)}">${escapeHtml(t(label))}</span>`;
}

function staffQuoteStatusLabel(quote) {
  const audit = quoteCarrierAuditSummary(quote);
  if (adminQuoteMatchesFilter(quote, "booked", state.shipments)) return "Booked";
  if (adminQuoteMatchesFilter(quote, "cancelled", state.shipments)) return "Cancelled";
  if (adminQuoteMatchesFilter(quote, "expired", state.shipments)) return "Expired";
  if (isAdminQuoteIssue(quote) || audit.allFailed) return "Failed";
  if (isPreferenceExcludedQuote(quote)) return "Filtered by Customer Preferences";
  if (audit.partialFailure) return "Partial Failure";
  if (isAdminReadyToBookQuote(quote, state.shipments)) return "Ready to Book";
  if (!quoteHasUsableRates(quote)) return "No Rates";
  return "Status Pending";
}

function staffCarrierAuditSummaryLabel(quote) {
  const audit = quoteCarrierAuditSummary(quote);
  if (!audit.requested && audit.excluded) return `${audit.excluded} ${escapeHtml(t("Customer Preferences"))}`;
  if (!audit.requested) return escapeHtml(t("No carrier audit"));
  if (audit.allFailed) return escapeHtml(t("All platforms failed"));
  if (audit.partialFailure) return escapeHtml(t("Partial platform failure"));
  const excluded = audit.excluded ? ` · ${audit.excluded} ${escapeHtml(t("Customer Preferences"))}` : "";
  return `${escapeHtml(t("Platform summary"))}: ${audit.succeeded}/${audit.requested}${excluded}`;
}

function customerById(customerId) {
  return state.customers.find((customer) => customer.id === customerId) || null;
}

function renderCustomerDashboard() {
  const dashboard = document.getElementById("dashboardView");
  if (!dashboard) {
    return;
  }
  dashboard.classList.remove("staff-dashboard-view");
  dashboard.classList.add("customer-dashboard-view");
  if (state.dashboardLoading && !state.quotes.length && !state.shipments.length && !state.invoices.length) {
    dashboard.innerHTML = `<div class="customer-dashboard-shell"><div class="empty-state" aria-live="polite">${t("Loading customer dashboard...")}</div></div>`;
    return;
  }

  const customer = currentCustomer();
  const model = customerDashboardViewModel({
    quotes: state.quotes,
    shipments: state.shipments,
    invoices: state.invoices
  });
  const attentionItems = aggregateReadyQuoteAttentionItems(model.attentionItems);
  const latestQuote = latestCustomerQuote();
  const repeatDisabled = !latestQuote;
  dashboard.innerHTML = `
    <div class="customer-dashboard-shell">
      ${state.dashboardError ? `<div class="quote-status notice-state" role="alert">${escapeHtml(state.dashboardError)}</div>` : ""}
      ${state.dashboardFilter ? `<div class="customer-filter-note">${escapeHtml(t("Showing {filter}.", { filter: t(state.dashboardFilter) }))}</div>` : ""}
      <section class="customer-dashboard-hero">
        <div>
          <p class="eyebrow">${escapeHtml(t("Customer Portal"))}</p>
          <h2>${escapeHtml(t("Welcome back, {companyName}", { companyName: customer?.companyName || t("Your account") }))}</h2>
          <p>${escapeHtml(t("Manage your quotes, shipments, documents, and invoices."))}</p>
        </div>
        <div class="customer-dashboard-actions" aria-label="${escapeHtml(t("Dashboard actions"))}">
          <button class="primary-action" type="button" data-customer-dashboard-action="newQuote">${t("New Quote")}</button>
          <button class="secondary-action" type="button" data-customer-dashboard-action="trackShipment">${t("Track Shipment")}</button>
          <div class="customer-dashboard-aux-actions">
            <button class="link-action" type="button" data-customer-dashboard-action="repeatLastQuote" ${repeatDisabled ? "disabled" : ""} aria-label="${escapeHtml(repeatDisabled ? t("No previous quotes to repeat.") : t("Repeat Last Quote"))}">${t("Repeat Last Quote")}</button>
            <button class="link-action" type="button" data-customer-dashboard-action="savedAddresses">${t("View Saved Addresses")}</button>
            <button class="link-action" type="button" data-customer-dashboard-action="contactSupport">${t("Contact Support")}</button>
          </div>
        </div>
      </section>
      ${customerKpiGridHtml(model.metrics)}
      <div class="customer-dashboard-main">
        ${activeShipmentsSectionHtml(model.activeShipments.slice(0, 5))}
        ${needsAttentionSectionHtml(attentionItems)}
      </div>
      <div class="customer-dashboard-lower customer-dashboard-lower-full">
        ${recentQuotesSectionHtml(model.recentQuotes.slice(0, 5))}
      </div>
    </div>
  `;
}

function customerKpiGridHtml(metrics) {
  const cards = [
    {
      key: "readyQuotes",
      label: t("Ready to Book KPI"),
      count: metrics.readyToBook,
      helper: t("Quotes with available rates"),
      action: t("View quotes"),
      filter: "Ready-to-book quotes"
    },
    {
      key: "activeShipments",
      label: t("Active Shipments"),
      count: metrics.activeShipments,
      helper: t("Booked and moving shipments"),
      action: t("View shipments"),
      filter: "Active shipments"
    },
    {
      key: "openInvoices",
      label: t("Open Invoices"),
      count: metrics.openInvoices,
      helper: t("Invoices requiring review or payment"),
      action: t("View invoices"),
      filter: "Open invoices"
    },
    {
      key: "deliveredThisMonth",
      label: t("Delivered This Month"),
      count: metrics.deliveredThisMonth,
      helper: t("Completed this calendar month"),
      action: t("View delivered"),
      filter: "Delivered shipments this month"
    }
  ];
  return `
    <section class="customer-kpi-grid" aria-label="${escapeHtml(t("Dashboard"))}">
      ${cards.map((card) => `
        <button class="customer-kpi-card ${card.count > 0 ? "has-count" : "is-zero"}" type="button" data-dashboard-filter="${escapeHtml(card.key)}">
          <i aria-hidden="true">${escapeHtml(customerKpiMarker(card.key))}</i>
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(String(card.count))}</strong>
          <small>${escapeHtml(card.helper)}</small>
          <em>${escapeHtml(card.action)} →</em>
        </button>
      `).join("")}
    </section>
  `;
}

function customerKpiMarker(key) {
  return {
    readyQuotes: "Q",
    activeShipments: "S",
    openInvoices: "I",
    deliveredThisMonth: "D"
  }[key] || "";
}

function activeShipmentsSectionHtml(shipments) {
  return `
    <section class="panel customer-panel customer-active-shipments">
      <div class="panel-heading">
        <h2>${t("Active Shipments")}</h2>
        <button class="link-action" type="button" data-dashboard-filter="activeShipments">${t("View all shipments")}</button>
      </div>
      <div class="customer-card-stack">
        ${shipments.length
          ? shipments.map(customerShipmentCardHtml).join("")
          : `
            <div class="empty-state action-empty">
              <p>${t("No active shipments. Book a quote to start a shipment.")}</p>
              <div class="row-actions compact-actions">
                <button class="secondary-action" type="button" data-dashboard-filter="readyQuotes">${t("View Ready-to-Book Quotes")}</button>
                <button class="primary-action" type="button" data-customer-dashboard-action="newQuote">${t("New Quote")}</button>
              </div>
            </div>
          `}
      </div>
    </section>
  `;
}

function customerShipmentCardHtml(shipment) {
  const eta = shipment.estimatedDeliveryDate || shipment.eta || "";
  const pickupDate = shipment.pickupDate?.date || shipment.pickupDate || "";
  return `
    <article class="customer-shipment-card">
      <div class="customer-card-title-row">
        ${customerShipmentStatusBadgeHtml(shipment.status)}
        <strong>${escapeHtml(shipment.confirmationNumber || t("Status Pending"))}</strong>
      </div>
      <p>${escapeHtml(routeLabel(shipment.pickup, shipment.delivery))}</p>
      <div class="customer-safe-meta">
        <span>${escapeHtml(shipmentCarrierLabel(shipment))}</span>
        ${eta ? `<span>${t("ETA")} ${escapeHtml(formatDate(eta))}</span>` : ""}
        ${pickupDate ? `<span>${t("Pickup date")} ${escapeHtml(formatDate(pickupDate))}</span>` : ""}
        ${shipment.referenceNumber ? `<span>${t("PO")} ${escapeHtml(shipment.referenceNumber)}</span>` : ""}
        ${hasDisplayValue(shipment.sellPrice) ? `<span>${escapeHtml(customerPriceLabel())} ${money.format(Number(shipment.sellPrice || 0))}</span>` : ""}
      </div>
      <div class="row-actions">
        <button class="secondary-action" type="button" data-view-shipment="${escapeHtml(shipment.id)}">${t("View Details")}</button>
        <button class="secondary-action" type="button" data-track-shipment="${escapeHtml(shipment.id)}">${t("Track")}</button>
        <button class="secondary-action" type="button" data-customer-documents="${escapeHtml(shipment.id)}">${t("Documents")}</button>
      </div>
    </article>
  `;
}

function needsAttentionSectionHtml(items) {
  const preview = items.slice(0, 3);
  const remaining = Math.max(items.length - preview.length, 0);
  const viewAllAttrs = attentionViewAllAttrs(items);
  return `
    <section class="panel customer-panel customer-attention">
      <div class="panel-heading">
        <h2>${t("Needs Attention")}</h2>
        ${items.length ? `<button class="link-action" type="button" ${viewAllAttrs}>${t("View all")}</button>` : ""}
      </div>
      <div class="customer-card-stack">
        ${preview.length ? preview.map(attentionItemHtml).join("") : `<div class="empty-state">${t("You're all caught up.")}</div>`}
        ${remaining > 0 ? `<button class="link-action attention-more-action" type="button" ${viewAllAttrs}>${escapeHtml(t("{count} more items", { count: remaining }))}</button>` : ""}
      </div>
    </section>
  `;
}

function attentionItemHtml(item) {
  if (item.type === "ready_quote" || item.type === "ready_quote_group") {
    return readyQuoteAttentionItemHtml(item);
  }
  const config = {
    shipment_exception: {
      marker: "!",
      title: t("Shipment requires attention"),
      detail: item.shipment?.confirmationNumber || "",
      action: t("Review shipment"),
      actionAttrs: `data-track-shipment="${escapeHtml(item.shipment?.id || "")}"`
    },
    invoice_overdue: {
      marker: "!",
      title: t("Invoice overdue"),
      detail: item.invoice?.invoiceNumber || "",
      action: t("Review invoice"),
      actionAttrs: `data-view-invoice="${escapeHtml(item.invoice?.id || "")}"`
    },
    invoice_due_soon: {
      marker: "•",
      title: t("Invoice due soon"),
      detail: item.invoice?.invoiceNumber || "",
      action: t("Review invoice"),
      actionAttrs: `data-view-invoice="${escapeHtml(item.invoice?.id || "")}"`
    }
  }[item.type];
  return `
    <article class="attention-item">
      <span class="attention-marker" aria-hidden="true">${escapeHtml(config.marker)}</span>
      <div>
        <strong>${escapeHtml(config.title)}</strong>
        <small>${escapeHtml(config.detail || "")}${item.date ? ` · ${escapeHtml(formatDate(item.date))}` : ""}</small>
      </div>
      <button class="link-action" type="button" ${config.actionAttrs}>${escapeHtml(config.action)} →</button>
    </article>
  `;
}

function readyQuoteAttentionItemHtml(item) {
  const quote = item.quote || item.quotes?.[0] || {};
  const grouped = item.type === "ready_quote_group";
  const count = grouped ? item.quotes.length : 1;
  const rateCount = item.rateCount ?? customerVisibleRates(quote).length;
  const lowest = item.lowestSellPrice ?? quoteLowestSellPrice(quote);
  const title = grouped
    ? t("{count} ready quotes", { count })
    : t("Quote {quoteNumber}", { quoteNumber: customerQuoteNumber(quote) });
  return `
    <article class="attention-item attention-ready-quote">
      <span class="attention-marker" aria-hidden="true">Q</span>
      <div>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(routeLabel(quote.pickup, quote.delivery))}</small>
        <div class="customer-safe-meta attention-meta">
          ${!grouped ? `<span>${escapeHtml(t("Quote {quoteNumber}", { quoteNumber: customerQuoteNumber(quote) }))}</span>` : ""}
          ${Number.isFinite(lowest) ? `<span class="price-meta">${escapeHtml(t("Lowest price"))} ${money.format(lowest)}</span>` : ""}
          <span>${escapeHtml(String(rateCount))} ${t("available rate(s)")}</span>
          ${item.date ? `<span>${escapeHtml(formatDateTime(item.date))}</span>` : ""}
        </div>
      </div>
      <button class="link-action" type="button" data-dashboard-filter="readyQuotes">${escapeHtml(t("Review quote"))} →</button>
    </article>
  `;
}

function attentionViewAllAttrs(items) {
  if (items.some((item) => item.type === "ready_quote" || item.type === "ready_quote_group")) {
    return `data-dashboard-filter="readyQuotes"`;
  }
  if (items.some((item) => item.type === "shipment_exception")) {
    return `data-dashboard-filter="activeShipments"`;
  }
  return `data-dashboard-filter="openInvoices"`;
}

function recentQuotesSectionHtml(quotes) {
  return `
    <section class="panel customer-panel">
      <div class="panel-heading">
        <h2>${t("Recent Quotes")}</h2>
        <button class="link-action" type="button" data-dashboard-filter="quoteAll">${t("View all quotes")}</button>
      </div>
      <div class="customer-card-stack">
        ${quotes.length
          ? quotes.map(customerQuoteRowHtml).join("")
          : `
            <div class="empty-state action-empty">
              <p>${t("No quotes yet. Create your first quote.")}</p>
              <button class="primary-action" type="button" data-customer-dashboard-action="newQuote">${t("+ New Quote")}</button>
            </div>
          `}
      </div>
    </section>
  `;
}

function customerQuoteRowHtml(quote) {
  const rates = customerVisibleRates(quote);
  const lowest = quoteLowestSellPrice(quote);
  const quoteNumber = customerQuoteNumber(quote);
  const reference = quote.referenceNumber || quote.poNumber || quote.customerReference || "";
  return `
    <article class="customer-quote-row">
      <div class="customer-quote-content">
        <div class="customer-quote-title-row">
          <strong>${escapeHtml(t("Quote {quoteNumber}", { quoteNumber }))}</strong>
          ${customerQuoteStatusBadgeHtml(quote)}
        </div>
        <p class="customer-quote-route">${escapeHtml(routeLabel(quote.pickup, quote.delivery))}</p>
        <div class="customer-quote-meta">
          <span>${escapeHtml(formatDateTime(quote.createdAt))}</span>
          ${reference ? `<span>${escapeHtml(t("Reference {reference}", { reference }))}</span>` : ""}
          <span>${escapeHtml(String(rates.length))} ${t("available rate(s)")}</span>
        </div>
      </div>
      <div class="customer-quote-side">
        <div class="customer-quote-price">
          <small>${escapeHtml(t("Lowest price"))}</small>
          <strong>${Number.isFinite(lowest) ? money.format(lowest) : escapeHtml(t("No Rates"))}</strong>
        </div>
        <div class="row-actions">
          <button class="secondary-action" type="button" data-view-quote="${escapeHtml(quote.id)}">${t("View Quote")}</button>
          <button class="secondary-action" type="button" data-reenter-quote="${escapeHtml(quote.id)}">${t("Repeat Quote")}</button>
        </div>
      </div>
    </article>
  `;
}

function customerQuoteStatusBadgeHtml(quote) {
  const label = quoteStatusLabelKey(quote, state.shipments);
  const variant = {
    "Ready to Book": "blue",
    Booked: "green",
    "No Rates": "neutral",
    Expired: "gray",
    Exception: "red",
    "Status Pending": "neutral"
  }[label] || "neutral";
  return `<span class="status-badge status-${escapeHtml(variant)}">${escapeHtml(t(label))}</span>`;
}

function currentCustomer() {
  return state.customers.find((customer) => customer.id === state.user?.customerId) || state.customers[0] || null;
}

function resetCustomerFilterForView(view) {
  if (!isCustomerUser()) {
    return;
  }
  state.dashboardFilter = "";
  if (view === "quotes") {
    state.customerFilters.quotes = "all";
  } else if (view === "shipments") {
    state.customerFilters.shipments = "all";
  } else if (view === "invoices") {
    state.customerFilters.invoices = "all";
  }
}

function setCustomerFilter(view, filter) {
  if (!isCustomerUser()) {
    return;
  }
  if (["quotes", "shipments", "invoices"].includes(view)) {
    state.customerFilters[view] = filter || "all";
    if (view === "quotes") {
      renderQuotesView();
    } else if (view === "shipments") {
      renderShipments();
    } else {
      renderInvoices();
    }
  }
}

function resetStaffFilterForView(view) {
  if (isCustomerUser()) {
    return;
  }
  if (["quotes", "shipments", "invoices"].includes(view)) {
    state.staffFilters[view] = "all";
    state.staffFilterRanges[view] = "all";
  }
}

function setStaffFilter(view, filter) {
  if (isCustomerUser() || !["quotes", "shipments", "invoices"].includes(view)) {
    return;
  }
  state.staffFilters[view] = filter || "all";
  if (view === "quotes") {
    renderQuotesView();
  } else if (view === "shipments") {
    renderShipments();
  } else {
    renderInvoices();
  }
}

function clearStaffDateRangeFilter(view) {
  if (isCustomerUser() || !["quotes", "shipments", "invoices"].includes(view)) {
    return;
  }
  state.staffFilterRanges[view] = "all";
  if (view === "quotes") renderQuotesView();
  if (view === "shipments") renderShipments();
  if (view === "invoices") renderInvoices();
}

function clearAllStaffFilters(view) {
  if (isCustomerUser() || !["quotes", "shipments", "invoices"].includes(view)) {
    return;
  }
  state.staffFilters[view] = "all";
  state.staffFilterRanges[view] = "all";
  if (view === "quotes") renderQuotesView();
  if (view === "shipments") renderShipments();
  if (view === "invoices") renderInvoices();
}

function customerFilterBarHtml(view, filters, activeFilter) {
  const activeLabel = filters.find((filter) => filter.value === activeFilter)?.label || "All";
  return `
    <div class="customer-filter-bar" aria-label="${escapeHtml(t("Filter: {filter}", { filter: t(activeLabel) }))}">
      ${filters.map((filter) => `
        <button class="filter-chip ${activeFilter === filter.value ? "active" : ""}" type="button" data-customer-filter-view="${escapeHtml(view)}" data-customer-filter="${escapeHtml(filter.value)}">
          ${escapeHtml(t(filter.label))}
        </button>
      `).join("")}
      ${activeFilter !== "all" ? `<button class="link-action" type="button" data-customer-filter-view="${escapeHtml(view)}" data-customer-filter="all">${t("Clear Filter")}</button>` : ""}
    </div>
  `;
}

function customerQuoteMatchesFilter(quote, filter) {
  const label = quoteStatusLabelKey(quote, state.shipments);
  return filter === "all" ||
    (filter === "ready" && label === "Ready to Book") ||
    (filter === "booked" && label === "Booked") ||
    (filter === "noRates" && label === "No Rates") ||
    (filter === "expired" && label === "Expired");
}

function customerShipmentMatchesFilter(shipment, filter) {
  return filter === "all" ||
    (filter === "active" && isActiveShipment(shipment)) ||
    (filter === "deliveredThisMonth" && isDeliveredThisMonth(shipment));
}

function customerInvoiceMatchesFilter(invoice, filter) {
  return filter === "all" || (filter === "open" && isOpenInvoice(invoice));
}

function latestCustomerQuote() {
  return recentByCreatedAt(state.quotes)[0] || null;
}

function routeLabel(pickup, delivery) {
  const pickupLabel = cityStateLabel(pickup?.address || pickup);
  const deliveryLabel = cityStateLabel(delivery?.address || delivery);
  return [pickupLabel, deliveryLabel].filter(Boolean).join(" → ") || t("Status Pending");
}

function cityStateLabel(address = {}) {
  return [address.city, address.state].filter(Boolean).join(", ");
}

function customerShipmentStatusBadgeHtml(status) {
  const variant = shipmentStatusVariant(status);
  const label = t(shipmentStatusLabelKey(status));
  return `<span class="status-badge status-${escapeHtml(variant)}">${escapeHtml(label)}</span>`;
}

function handleCustomerDashboardAction(action) {
  if (!isCustomerUser()) {
    return;
  }
  if (action === "newQuote") {
    state.dashboardFilter = "";
    setView("quote");
    window.requestAnimationFrame(() => {
      if (isPickupAutofillEmpty()) {
        autofillPickupFromCustomer(state.user?.customerId, true);
      }
    });
    return;
  }
  if (action === "repeatLastQuote") {
    const quote = latestCustomerQuote();
    if (quote) {
      reenterQuote(quote.id);
    }
    return;
  }
  if (action === "trackShipment") {
    openTrackShipmentModal();
    return;
  }
  if (action === "savedAddresses") {
    setView("quote");
    window.requestAnimationFrame(() => {
      const tools = document.querySelector("[data-address-book-tools]");
      tools?.scrollIntoView({ block: "center", behavior: "smooth" });
      tools?.querySelector("select, input, button")?.focus();
    });
    return;
  }
  if (action === "contactSupport") {
    openContactSupport();
  }
}

function navigateCustomerDashboardFilter(filter) {
  if (!isCustomerUser()) {
    navigateStaffDashboardFilter(filter);
    return;
  }
  const filterLabels = {
    quoteAll: "All",
    readyQuotes: "Ready-to-book quotes",
    activeShipments: "Active shipments",
    openInvoices: "Open invoices",
    deliveredThisMonth: "Delivered shipments this month"
  };
  state.dashboardFilter = filterLabels[filter] || "";
  if (state.dashboardFilter) {
    showToast(t("Filter: {filter}", { filter: t(state.dashboardFilter) }));
  }
  if (filter === "readyQuotes" || filter === "quoteAll") {
    state.customerFilters.quotes = filter === "readyQuotes" ? "ready" : "all";
    setView("quotes");
    return;
  }
  if (filter === "openInvoices") {
    state.customerFilters.invoices = "open";
    setView("invoices");
    return;
  }
  if (filter === "activeShipments") {
    state.customerFilters.shipments = "active";
  } else if (filter === "deliveredThisMonth") {
    state.customerFilters.shipments = "deliveredThisMonth";
  }
  setView("shipments");
}

function navigateStaffDashboardFilter(filter) {
  if (isCustomerUser()) {
    return;
  }
  if (filter === "activeShipments" || filter === "shipmentExceptions") {
    state.staffFilters.shipments = filter === "shipmentExceptions" ? "exceptions" : "active";
    state.staffFilterRanges.shipments = state.staffDashboardRange;
    setView("shipments");
    return;
  }
  if (filter === "openInvoices") {
    state.staffFilters.invoices = "open";
    state.staffFilterRanges.invoices = state.staffDashboardRange;
    setView("invoices");
    return;
  }
  const quoteFilters = {
    quotesCreated: "all",
    readyQuotes: "ready",
    quoteIssues: "issues"
  };
  state.staffFilters.quotes = quoteFilters[filter] || "all";
  state.staffFilterRanges.quotes = state.staffDashboardRange;
  setView("quotes");
}

function handleStaffDashboardAction(action) {
  if (isCustomerUser()) {
    return;
  }
  if (action === "newQuote") {
    setView("quote");
    return;
  }
  if (action === "search") {
    openStaffSearchModal();
    return;
  }
  if (action === "customers") {
    setView("customers");
    return;
  }
  if (action === "diagnostics") {
    openCarrierDiagnosticsModal();
  }
}

function openStaffSearchModal() {
  if (isCustomerUser()) {
    return;
  }
  openModal(t("Search operations"), `
    <div class="staff-search-modal">
      <p>${escapeHtml(t("Search by quote, PO, shipment, invoice, or customer."))}</p>
      <label>
        ${escapeHtml(t("Search terms"))}
        <input id="staffSearchInput" type="search" autocomplete="off">
      </label>
      <div class="modal-actions">
        <button class="primary-action" type="button" data-staff-search-submit>${escapeHtml(t("Search"))}</button>
      </div>
      <div id="staffSearchResults" class="staff-card-stack" aria-live="polite"></div>
    </div>
  `);
  window.requestAnimationFrame(() => document.getElementById("staffSearchInput")?.focus());
}

function runStaffSearch() {
  const input = document.getElementById("staffSearchInput");
  const results = document.getElementById("staffSearchResults");
  if (!input || !results) {
    return;
  }
  const query = String(input.value || "").trim().toLowerCase();
  if (!query) {
    results.innerHTML = `<div class="empty-state">${escapeHtml(t("No search results."))}</div>`;
    return;
  }
  const groups = [
    {
      label: "Quotes",
      type: "quote",
      items: state.quotes.filter((quote) => [customerQuoteNumber(quote), quote.referenceNumber, quote.poNumber, quote.customerReference].some((value) => String(value || "").toLowerCase().includes(query))),
      render: (quote) => `${customerQuoteNumber(quote)} · ${quote.referenceNumber || quote.poNumber || ""}`
    },
    {
      label: "Shipments",
      type: "shipment",
      items: state.shipments.filter((shipment) => [shipment.confirmationNumber, shipment.referenceNumber].some((value) => String(value || "").toLowerCase().includes(query))),
      render: (shipment) => `${shipment.confirmationNumber || shipment.id} · ${shipment.referenceNumber || ""}`
    },
    {
      label: "Invoices",
      type: "invoice",
      items: state.invoices.filter((invoice) => [invoice.invoiceNumber, invoice.referenceNumber].some((value) => String(value || "").toLowerCase().includes(query))),
      render: (invoice) => `${invoice.invoiceNumber || invoice.id}`
    },
    {
      label: "Customers",
      type: "customer",
      items: state.customers.filter((customer) => [customer.companyName, customer.name, customer.billingEmail].some((value) => String(value || "").toLowerCase().includes(query))),
      render: (customer) => `${customer.companyName || customer.name || customer.id} · ${customer.billingEmail || ""}`
    }
  ];
  const html = groups
    .filter((group) => group.items.length)
    .map((group) => `
      <section class="staff-search-group">
        <strong>${escapeHtml(t(group.label))}</strong>
        ${group.items.slice(0, 6).map((item) => `
          <button class="track-result" type="button" data-staff-search-type="${escapeHtml(group.type)}" data-staff-search-result="${escapeHtml(item.id)}">
            <span>${escapeHtml(group.render(item))}</span>
          </button>
        `).join("")}
      </section>
    `).join("");
  results.innerHTML = html || `<div class="empty-state">${escapeHtml(t("No search results."))}</div>`;
}

function openStaffSearchResult(type, id) {
  closeModal();
  if (type === "quote") {
    openQuoteDetails(id);
    return;
  }
  if (type === "shipment") {
    openShipmentTracking(id);
    return;
  }
  if (type === "invoice") {
    openInvoiceDetails(id);
    return;
  }
  if (type === "customer") {
    setView("customers");
  }
}

function openCarrierDiagnosticsModal() {
  if (isCustomerUser()) {
    return;
  }
  const channels = adminCarrierChannels(state.health || {}, state.quotes);
  openModal(t("Carrier Diagnostics"), `
    <div class="staff-card-stack">
      ${channels.map((channel) => `
        <article class="carrier-channel-card">
          <div>
            <strong>${escapeHtml(channel.name)}</strong>
            <small>${escapeHtml(t(channel.configured === "configured" ? "Configured" : channel.configured === "not_configured" ? "Not Configured" : "Unknown"))}</small>
            <small>${escapeHtml(t(channel.health === "healthy" ? "Healthy" : channel.health === "degraded" ? "Degraded" : channel.health === "error" ? "Error" : "Unknown"))}</small>
            ${typeof channel.bookingEnabled === "boolean" ? `<small>${escapeHtml(t(channel.bookingEnabled ? "Booking enabled" : "Booking disabled"))}</small>` : ""}
            ${channel.lastSuccessfulQuoteAt ? `<small>${escapeHtml(t("Last successful quote {time}", { time: formatDateTime(channel.lastSuccessfulQuoteAt) }))}</small>` : ""}
            ${channel.lastErrorSummary ? `<small>${escapeHtml(t("Last error: {message}", { message: channel.lastErrorSummary }))}</small>` : ""}
          </div>
          ${channel.failedQuoteIds?.length ? `
            <div class="staff-card-stack compact-stack">
              <strong>${escapeHtml(t("Failed quotes"))}</strong>
              ${channel.failedQuoteIds.map((quoteId) => `<button class="link-action" type="button" data-view-quote="${escapeHtml(quoteId)}">${escapeHtml(customerQuoteNumber(state.quotes.find((quote) => quote.id === quoteId) || { id: quoteId }))}</button>`).join("")}
            </div>
          ` : ""}
        </article>
      `).join("")}
    </div>
  `);
}

function openTrackShipmentModal() {
  openModal(
    t("Track a shipment"),
    `
      <div class="track-shipment-modal">
        <p>${escapeHtml(t("Enter a confirmation number or PO/reference number."))}</p>
        <label>
          ${escapeHtml(t("Confirmation or PO/reference number"))}
          <input id="trackShipmentSearchInput" type="search" autocomplete="off">
        </label>
        <div class="modal-actions">
          <button class="primary-action" type="button" data-track-search>${t("Search")}</button>
        </div>
        <div id="trackShipmentSearchResults" class="customer-card-stack" aria-live="polite"></div>
      </div>
    `
  );
  window.requestAnimationFrame(() => document.getElementById("trackShipmentSearchInput")?.focus());
}

function runTrackShipmentSearch() {
  const input = document.getElementById("trackShipmentSearchInput");
  const results = document.getElementById("trackShipmentSearchResults");
  if (!input || !results) {
    return;
  }
  const query = String(input.value || "").trim().toLowerCase();
  if (!query) {
    results.innerHTML = `<div class="empty-state">${t("No matching shipments found.")}</div>`;
    return;
  }
  const exact = state.shipments.filter((shipment) =>
    [shipment.confirmationNumber, shipment.referenceNumber].some((value) => String(value || "").trim().toLowerCase() === query)
  );
  if (exact.length === 1) {
    openShipmentTracking(exact[0].id);
    return;
  }
  const matches = exact.length
    ? exact
    : state.shipments.filter((shipment) =>
        [shipment.confirmationNumber, shipment.referenceNumber].some((value) => String(value || "").toLowerCase().includes(query))
      );
  if (!matches.length) {
    results.innerHTML = `<div class="empty-state">${t("No matching shipments found.")}</div>`;
    return;
  }
  results.innerHTML = `
    <strong>${t("Select a shipment")}</strong>
    ${matches.slice(0, 8).map((shipment) => `
      <button class="track-result" type="button" data-track-result="${escapeHtml(shipment.id)}">
        <span>${escapeHtml(shipment.confirmationNumber || "")}</span>
        <small>${escapeHtml(routeLabel(shipment.pickup, shipment.delivery))}${shipment.referenceNumber ? ` · PO ${escapeHtml(shipment.referenceNumber)}` : ""}</small>
      </button>
    `).join("")}
  `;
}

function openContactSupport() {
  const configuredEmail = String(window.TMS_PUBLIC_SUPPORT_EMAIL || window.PUBLIC_SUPPORT_EMAIL || "").trim();
  if (configuredEmail) {
    window.location.href = `mailto:${encodeURIComponent(configuredEmail)}?subject=${encodeURIComponent("Customer portal support")}`;
    return;
  }
  openModal(t("Customer support"), `<div class="empty-state">${escapeHtml(t("Please contact customer service for help with your shipment, invoice, or quote."))}</div>`);
}

async function openCustomerShipmentDocuments(shipmentId) {
  const shipment = state.shipments.find((item) => item.id === shipmentId);
  if (!shipment) {
    return;
  }
  const title = `${t("Documents")} ${shipment.confirmationNumber || ""}`.trim();
  openModal(title, customerDocumentsPanelHtml(shipment, [], "loading"));
  try {
    const response = await api(`/api/shipments/${shipmentId}/documents`);
    if (!state.modal || state.modal.title !== title) {
      return;
    }
    paintModal(title, customerDocumentsPanelHtml(shipment, response.documents || [], "loaded"));
  } catch {
    if (!state.modal || state.modal.title !== title) {
      return;
    }
    paintModal(title, customerDocumentsPanelHtml(shipment, [], "error"));
  }
}

function customerDocumentsPanelHtml(shipment, documents = [], loadState = "loaded") {
  if (loadState === "error") {
    return `
      <div class="detail-grid">
        ${detailSection(
          t("Documents"),
          `
            <div class="empty-state">
              <p>${escapeHtml(t("Documents could not be loaded."))}</p>
              <button class="primary-action" type="button" data-customer-documents="${escapeHtml(shipment.id)}">${t("Try Again")}</button>
            </div>
          `
        )}
      </div>
    `;
  }
  const bol = filterShipmentDocumentsByKind(documents, "bol");
  const pod = filterShipmentDocumentsByKind(documents, "pod");
  const other = documents.filter((document) => !bol.includes(document) && !pod.includes(document));
  const rows = [
    customerDocumentStatusRow(t("Bill of Lading"), bol, loadState, shipment),
    customerDocumentStatusRow(t("Proof of Delivery"), pod, loadState, shipment),
    customerDocumentStatusRow(t("Other Documents"), other, loadState, shipment)
  ];
  return `
    <div class="detail-grid">
      ${detailSection(
        t("Documents"),
        `
          <div class="meta-line">
            <span class="pill">${escapeHtml(shipment.confirmationNumber || "")}</span>
            <span class="pill">${escapeHtml(routeLabel(shipment.pickup, shipment.delivery))}</span>
          </div>
          <div class="customer-card-stack">${rows.join("")}</div>
        `
      )}
    </div>
  `;
}

function customerDocumentStatusRow(label, documents, loadState, shipment) {
  const status = loadState === "loading" ? t("document.status.pending") : documents.length ? t("Available") : t("Unavailable");
  const first = documents[0];
  return `
    <article class="document-status-row">
      <div>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(status)}</small>
      </div>
      ${first?.url ? `<a class="secondary-action document-link" href="${escapeHtml(first.url)}" target="_blank" rel="noopener noreferrer">${t("Open document")}</a>` : `<span class="pill">${escapeHtml(status)}</span>`}
    </article>
  `;
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
  const availabilityNotice = customerView ? rateAvailabilityNoticeHtml(quote.rateAvailability) : "";
  if (!Array.isArray(sortedRates) || sortedRates.length === 0) {
    if (customerView) {
      const notice = quote.rateAvailability?.messageCode === "NO_RATES_AVAILABLE_BY_PREFERENCE"
        ? t("No rates are available based on your current carrier preferences.")
        : t("No rates are currently available. Please contact customer service.");
      list.innerHTML = `
        <div class="quote-status notice-state">
          <p>${escapeHtml(notice)}</p>
        </div>
      `;
      return;
    }

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
    ${availabilityNotice}
    ${visibleRates
    .map((rate) => {
      const rateBookingAllowed = !customerView || rateBookingAllowedForUser(quote, rate);
      return `
      <article class="rate-item quote-rate-card">
        <div class="rate-main">
          <div class="rate-title-row">
            <span class="carrier-name-badge">${escapeHtml(carrierNameLabel(rate, quote, customerView))}</span>
            <span class="service-badge">${escapeHtml(formatRateService(rate?.service))}</span>
            ${customerView ? "" : `<span class="carrier-badge">${escapeHtml(carrierBadgeLabel(rate.provider, rate.carrierSource || quote.carrierMode, customerView))}</span>`}
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
            ? `<button class="primary-action rate-book-action" type="button" data-book-rate="${escapeHtml(rate.id)}" data-book-quote="${escapeHtml(quote.id)}">${t("Book Shipment")}</button>`
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
  const quote = state.currentQuote?.id === quoteId ? state.currentQuote : state.quotes.find((item) => item.id === quoteId);
  const rate = quote && Array.isArray(quote.rates) ? quote.rates.find((item) => item.id === rateId) : null;
  if (isCustomerUser() && quote && rate && !rateBookingAllowedForUser(quote, rate)) {
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
  if (!list) {
    return;
  }
  if (isCustomerUser()) {
    const activeFilter = state.customerFilters.shipments || "all";
    const filters = [
      { value: "all", label: "All" },
      { value: "active", label: "Active Shipments" },
      { value: "deliveredThisMonth", label: "Delivered This Month" }
    ];
    const shipments = state.shipments.filter((shipment) => customerShipmentMatchesFilter(shipment, activeFilter));
    list.innerHTML = `
      ${customerFilterBarHtml("shipments", filters, activeFilter)}
      <div class="customer-card-stack">
        ${shipments.length ? shipments.map(shipmentRow).join("") : `<div class="empty-state">${t("No shipments yet.")}</div>`}
      </div>
    `;
    return;
  }
  const activeFilter = state.staffFilters.shipments || "all";
  const activeRange = state.staffFilterRanges.shipments || "all";
  const filters = [
    { value: "all", label: "All" },
    { value: "active", label: "shipment.filter.active" },
    { value: "exceptions", label: "Exceptions" },
    { value: "delivered", label: "Delivered" },
    { value: "cancelled", label: "Cancelled" }
  ];
  const shipments = state.shipments.filter((shipment) =>
    adminShipmentMatchesFilter(shipment, activeFilter) &&
    adminRecordMatchesDateRange(shipment, activeRange)
  );
  list.innerHTML = `
    ${staffFilterBarHtml("shipments", filters, activeFilter, activeRange)}
    <div class="customer-card-stack">
      ${shipments.length
        ? shipments.map(shipmentRow).join("")
        : `<div class="empty-state">${escapeHtml(t("No filter results."))}</div>`}
    </div>
  `;
}

function renderInvoices() {
  const list = document.getElementById("invoiceList");
  if (!list) {
    return;
  }

  if (isCustomerUser()) {
    const activeFilter = state.customerFilters.invoices || "all";
    const filters = [
      { value: "all", label: "All" },
      { value: "open", label: "Open Invoices" }
    ];
    const invoices = state.invoices.filter((invoice) => customerInvoiceMatchesFilter(invoice, activeFilter));
    list.innerHTML = `
      ${customerFilterBarHtml("invoices", filters, activeFilter)}
      <div class="customer-card-stack">
        ${invoices.length ? invoices.map((invoice) => invoiceRow(invoice)).join("") : `<div class="empty-state">${t("No invoices yet.")}</div>`}
      </div>
    `;
    return;
  }

  const activeFilter = state.staffFilters.invoices || "all";
  const activeRange = state.staffFilterRanges.invoices || "all";
  const filters = [
    { value: "all", label: "All" },
    { value: "draft", label: "Draft" },
    { value: "open", label: "invoice.status.open" },
    { value: "overdue", label: "Overdue" },
    { value: "paid", label: "Paid" },
    { value: "importIssues", label: "Import Issues" }
  ];
  const staffInvoices = state.invoices.filter((invoice) =>
    adminInvoiceMatchesFilter(invoice, activeFilter) &&
    adminRecordMatchesDateRange(invoice, activeRange)
  );
  const mothershipInvoices = staffInvoices.filter((invoice) => invoice?.source === "mothership");
  const visibleOtherInvoices = staffInvoices.filter((invoice) => invoice?.source !== "mothership");
  const activeTab = resolveInvoiceTab(mothershipInvoices, visibleOtherInvoices);
  const visibleInvoices = activeTab === "mothership" ? mothershipInvoices : visibleOtherInvoices;
  const hiddenInvoices = activeTab === "mothership" ? visibleOtherInvoices : mothershipInvoices;
  const activeLabel = activeTab === "mothership" ? t("Imported from Mothership") : t("Other invoices");

  list.innerHTML = `
    ${staffFilterBarHtml("invoices", filters, activeFilter, activeRange)}
    <div class="invoice-tabs-shell">
      <div class="invoice-tabs" role="tablist" aria-label="${t("Invoice groups")}" data-i18n-aria-label="Invoice groups">
        <button class="invoice-tab ${activeTab === "mothership" ? "active" : ""}" type="button" data-invoice-tab="mothership" role="tab" aria-selected="${activeTab === "mothership"}">
          ${t("Imported from Mothership")} <span class="tab-count">${mothershipInvoices.length}</span>
        </button>
        <button class="invoice-tab ${activeTab === "local" ? "active" : ""}" type="button" data-invoice-tab="local" role="tab" aria-selected="${activeTab === "local"}">
          ${t("Other invoices")} <span class="tab-count">${visibleOtherInvoices.length}</span>
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

function wireAddressBookControls() {
  document.querySelectorAll("[data-address-book-select]").forEach((select) => {
    if (select.dataset.addressBookBound === "true") {
      return;
    }
    select.addEventListener("change", () => {
      const usage = select.dataset.addressBookSelect;
      const entry = state.addressBookEntries.find((item) => item.id === select.value);
      if (entry) {
        fillAddressFromEntry(usage, entry);
      }
    });
    select.dataset.addressBookBound = "true";
  });
  renderAddressBookControls();
}

function renderAddressBookControls() {
  ["pickup", "delivery"].forEach((usage) => {
    const select = document.querySelector(`[data-address-book-select='${usage}']`);
    if (!select) {
      return;
    }
    const currentValue = select.value;
    const entries = state.addressBookEntries.filter((entry) => entry.usageType === usage || entry.usageType === "both");
    select.innerHTML = [
      `<option value="">${escapeHtml(t("Choose saved address"))}</option>`,
      ...entries.map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.label || entry.companyName)}</option>`)
    ].join("");
    select.value = entries.some((entry) => entry.id === currentValue) ? currentValue : "";
  });
}

function currentAddressBookEntry(usage) {
  const prefix = usage === "delivery" ? "delivery" : "pickup";
  const form = document.getElementById("quoteForm");
  const formData = new FormData(form);
  const accessorials = prefix === "pickup"
    ? formData.getAll("pickupAccessorials")
    : normalizeDeliveryAccessorials(formData.getAll("deliveryAccessorials"));
  return {
    label: document.querySelector(`[data-address-book-label='${prefix}']`)?.value || "",
    usageType: document.querySelector(`[data-address-book-usage='${prefix}']`)?.value || prefix,
    companyName: form.elements[`${prefix}Name`]?.value || "",
    contactName: "",
    street: form.elements[`${prefix}Street`]?.value || "",
    city: form.elements[`${prefix}City`]?.value || "",
    state: form.elements[`${prefix}State`]?.value || "",
    zip: form.elements[`${prefix}Zip`]?.value || "",
    country: "US",
    phone: form.elements[`${prefix}Phone`]?.value || "",
    email: form.elements[`${prefix}Email`]?.value || "",
    openTime: form.elements[`${prefix}Open`]?.value || "",
    closeTime: form.elements[`${prefix}Close`]?.value || "",
    defaultAccessorials: accessorials,
    isDefaultPickup: prefix === "pickup" && Boolean(document.querySelector("[data-address-book-default='pickup']")?.checked),
    isDefaultDelivery: prefix === "delivery" && Boolean(document.querySelector("[data-address-book-default='delivery']")?.checked),
    customerId: document.getElementById("quoteCustomerSelect")?.value || state.user?.customerId || ""
  };
}

async function saveCurrentAddress(usage) {
  try {
    const response = await api("/api/address-book", {
      method: "POST",
      body: currentAddressBookEntry(usage)
    });
    state.addressBookEntries.push(response.entry);
    renderAddressBookControls();
    const select = document.querySelector(`[data-address-book-select='${usage}']`);
    if (select) {
      select.value = response.entry.id;
    }
    showToast(t("Address saved."));
  } catch (error) {
    showToast(error.message || t("Could not save address."), true);
  }
}

async function updateSavedAddress(usage) {
  const select = document.querySelector(`[data-address-book-select='${usage}']`);
  if (!select?.value) {
    showToast(t("Choose saved address"), true);
    return;
  }
  try {
    const response = await api(`/api/address-book/${encodeURIComponent(select.value)}`, {
      method: "PATCH",
      body: currentAddressBookEntry(usage)
    });
    state.addressBookEntries = state.addressBookEntries.map((entry) => entry.id === response.entry.id ? response.entry : entry);
    renderAddressBookControls();
    select.value = response.entry.id;
    showToast(t("Address updated."));
  } catch (error) {
    showToast(error.message || t("Could not update address."), true);
  }
}

function fillAddressFromEntry(usage, entry) {
  const prefix = usage === "delivery" ? "delivery" : "pickup";
  const form = document.getElementById("quoteForm");
  const values = {
    [`${prefix}Name`]: entry.companyName,
    [`${prefix}Street`]: entry.street,
    [`${prefix}City`]: entry.city,
    [`${prefix}State`]: entry.state,
    [`${prefix}Zip`]: entry.zip,
    [`${prefix}Phone`]: entry.phone,
    [`${prefix}Email`]: entry.email || "",
    [`${prefix}Open`]: entry.openTime,
    [`${prefix}Close`]: entry.closeTime
  };
  Object.entries(values).forEach(([name, value]) => {
    if (form.elements[name]) {
      form.elements[name].value = value || "";
    }
  });
  setQuoteCheckboxGroup(`${prefix}Accessorials`, entry.defaultAccessorials || []);
  document.querySelectorAll(".accessorial-dropdown").forEach((details) => syncAccessorialDropdown(details));
  const labelInput = document.querySelector(`[data-address-book-label='${prefix}']`);
  if (labelInput) {
    labelInput.value = entry.label || "";
  }
  const usageSelect = document.querySelector(`[data-address-book-usage='${prefix}']`);
  if (usageSelect) {
    usageSelect.value = entry.usageType || prefix;
  }
  const defaultCheckbox = document.querySelector(`[data-address-book-default='${prefix}']`);
  if (defaultCheckbox) {
    defaultCheckbox.checked = prefix === "pickup" ? Boolean(entry.isDefaultPickup) : Boolean(entry.isDefaultDelivery);
  }
  triggerZipAutofillField(`${prefix}Zip`, form);
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
    syncAccessorialDropdown(details);
  });

  syncCarrierControls();
  clearQuoteFormErrors(form);
  updateFreightClassSuggestion();
  triggerZipAutofillField("pickupZip", form);
  triggerZipAutofillField("deliveryZip", form);
}

function setQuoteCheckboxGroup(name, values) {
  const form = document.getElementById("quoteForm");
  const selected = new Set((Array.isArray(values) ? values : []).filter(Boolean));
  form?.querySelectorAll(`input[name='${name}']`).forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function triggerZipAutofillField(name, root = document) {
  const input = root.querySelector(`[name='${name}']`);
  if (!input) {
    return;
  }
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function normalizeDeliveryAccessorials(accessorials) {
  return Array.from(new Set(accessorials.filter(Boolean)));
}

function normalizePhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

const quoteIntakeFieldLabels = {
  "pickup.name": "Pickup company",
  "pickup.street": "Pickup address",
  "pickup.city": "City",
  "pickup.state": "State",
  "pickup.zip": "ZIP",
  "pickup.phone": "Phone",
  "pickup.openTime": "Pickup opening time",
  "pickup.closeTime": "Pickup closing time",
  "pickup.facilityCode": "Pickup facility code",
  "delivery.name": "Delivery company",
  "delivery.street": "Delivery address",
  "delivery.city": "City",
  "delivery.state": "State",
  "delivery.zip": "ZIP",
  "delivery.phone": "Phone",
  "delivery.openTime": "Delivery opening time",
  "delivery.closeTime": "Delivery closing time",
  "delivery.facilityCode": "Delivery facility code",
  "freight.quantity": "Quantity",
  "freight.type": "Packaging type",
  "freight.pieces": "Pieces",
  "freight.weight": "Weight each",
  "freight.weightUnit": "Weight unit",
  "freight.length": "Length",
  "freight.width": "Width",
  "freight.height": "Height",
  "freight.dimensionUnit": "Dimension unit",
  "freight.freightClass": "Freight class",
  "freight.nmfc": "Optional NMFC",
  "freight.description": "Description",
  "freight.stackable": "Stackable",
  "freight.hazmat": "Hazmat",
  "accessorials.liftgate": "Liftgate",
  "accessorials.inside": "Inside",
  "accessorials.appointment": "Appointment",
  "accessorials.residential": "Residential"
};

function quoteIntakeConfidenceLabel(value) {
  if (value === "high") {
    return t("High confidence");
  }
  if (value === "medium") {
    return t("Medium confidence");
  }
  return t("Low confidence");
}

function quoteIntakeDisplayValue(value) {
  if (typeof value === "boolean") {
    return value ? t("Yes") : t("No");
  }
  return String(value ?? "");
}

function parseQuoteIntakeFromForm() {
  const textarea = document.getElementById("quoteIntakeText");
  const text = String(textarea?.value || "").trim();
  if (!text) {
    showToast(t("Paste quote details before parsing."), true);
    return;
  }
  state.quoteIntake = parseQuoteIntakeText(text);
  renderQuoteIntakePreview();
  const count = state.quoteIntake.parsedFields.length;
  showToast(count ? t("Smart intake parsed {count} field(s).", { count }) : t("No fields were parsed. Review the notes and update the form manually."), !count);
}

function clearQuoteIntake() {
  state.quoteIntake = null;
  const textarea = document.getElementById("quoteIntakeText");
  if (textarea) {
    textarea.value = "";
  }
  renderQuoteIntakePreview();
  showToast(t("Smart intake cleared."));
}

function renderQuoteIntakePreview() {
  const container = document.getElementById("quoteIntakePreview");
  if (!container) {
    return;
  }
  const parsed = state.quoteIntake;
  if (!parsed) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  const fields = Array.isArray(parsed.parsedFields) ? parsed.parsedFields : [];
  const plan = buildQuoteIntakeApplicationPlan(parsed, {
    formUnits: state.freightUnits,
    availableTimeValues: quoteIntakeAvailableTimeValues()
  });
  const unsupportedPaths = new Set(plan.unsupported.map((item) => item.path));
  const fieldHtml = fields.length
    ? fields.map((item) => {
      const label = quoteIntakeFieldLabels[item.path] || item.path;
      const unsupported = unsupportedPaths.has(item.path);
      return `
        <div class="quote-intake-field">
          <strong>${escapeHtml(t(label))}</strong>
          <span>${escapeHtml(quoteIntakeDisplayValue(item.value))}</span>
          <span class="confidence-pill ${escapeHtml(unsupported ? "low" : item.confidence)}">${escapeHtml(unsupported ? t("Review required / not applied") : quoteIntakeConfidenceLabel(item.confidence))}</span>
        </div>
      `;
    }).join("")
    : `<p class="helper-text">${escapeHtml(t("No parsed fields yet."))}</p>`;
  const notes = parsed.unmatchedText || "";
  container.classList.remove("hidden");
  container.innerHTML = `
    <div class="quote-intake-preview-header">
      <div>
        <strong>${escapeHtml(t("Parsed fields"))}</strong>
        <span class="confidence-pill ${escapeHtml(parsed.confidence)}">${escapeHtml(quoteIntakeConfidenceLabel(parsed.confidence))}</span>
      </div>
      <button class="primary-action" type="button" data-quote-intake-apply ${fields.length ? "" : "disabled"}>${escapeHtml(t("Apply to Form"))}</button>
    </div>
    <div class="quote-intake-field-list">${fieldHtml}</div>
    <div>
      <strong>${escapeHtml(t("Unmatched notes"))}</strong>
      <p class="helper-text quote-intake-notes">${escapeHtml(notes || t("No unmatched notes."))}</p>
    </div>
  `;
}

function setControlThroughEvents(control, value) {
  if (!control) {
    return false;
  }
  if (control.tagName === "SELECT") {
    ensureQuoteIntakeSelectOption(control, value);
  }
  if (control.type === "checkbox") {
    control.checked = Boolean(value);
  } else {
    control.value = value ?? "";
  }
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function ensureQuoteIntakeSelectOption(control, value) {
  const text = String(value ?? "");
  if (!control || control.tagName !== "SELECT" || !text || Array.from(control.options).some((option) => option.value === text)) {
    return;
  }
  if (!/^([01]\d|2[0-3])[0-5]\d$/.test(text)) {
    return;
  }
  const option = document.createElement("option");
  option.value = text;
  option.textContent = `${text.slice(0, 2)}:${text.slice(2)}`;
  control.appendChild(option);
}

function quoteIntakeAvailableTimeValues() {
  const select = document.querySelector("[data-time-select]");
  return select ? Array.from(select.options).map((option) => option.value).filter(Boolean) : [];
}

function quoteIntakeCurrentValues(form) {
  const values = {};
  [
    "pickupName",
    "pickupStreet",
    "pickupCity",
    "pickupState",
    "pickupZip",
    "pickupPhone",
    "pickupOpen",
    "pickupClose",
    "deliveryName",
    "deliveryStreet",
    "deliveryCity",
    "deliveryState",
    "deliveryZip",
    "deliveryPhone",
    "deliveryOpen",
    "deliveryClose"
  ].forEach((name) => {
    values[name] = form.elements[name]?.value || "";
  });
  const row = freightRows()[0];
  ["quantity", "type", "pieces", "weight", "length", "width", "height", "freightClass", "nmfc", "description"].forEach((fieldName) => {
    values[`freight.${fieldName}`] = freightRowField(row, fieldName)?.value || "";
  });
  ["stackable", "hazmat"].forEach((flag) => {
    values[`freight.${flag}`] = Boolean(freightRowFlag(row, flag)?.checked);
  });
  ["pickup", "delivery"].forEach((scope) => {
    form.querySelectorAll(`input[name='${scope}Accessorials']`).forEach((input) => {
      values[`${scope}Accessorials.${input.value}`] = Boolean(input.checked);
    });
  });
  return values;
}

function quoteIntakeApplicationPlan(form, parsed) {
  ensureFreightRows();
  return buildQuoteIntakeApplicationPlan(parsed, {
    formUnits: state.freightUnits,
    currentValues: quoteIntakeCurrentValues(form),
    availableTimeValues: quoteIntakeAvailableTimeValues()
  });
}

function quoteIntakeControlTarget(form, target, value) {
  if (form.elements[target]) {
    return { control: form.elements[target], value };
  }
  const row = freightRows()[0];
  const freightMap = {
    "freight.quantity": ["field", "quantity"],
    "freight.type": ["field", "type"],
    "freight.pieces": ["field", "pieces"],
    "freight.weight": ["field", "weight"],
    "freight.length": ["field", "length"],
    "freight.width": ["field", "width"],
    "freight.height": ["field", "height"],
    "freight.freightClass": ["field", "freightClass"],
    "freight.nmfc": ["field", "nmfc"],
    "freight.description": ["field", "description"],
    "freight.stackable": ["flag", "stackable"],
    "freight.hazmat": ["flag", "hazmat"]
  };
  if (freightMap[target]) {
    const [kind, fieldName] = freightMap[target];
    return { control: kind === "flag" ? freightRowFlag(row, fieldName) : freightRowField(row, fieldName), value };
  }
  const accessorial = target.match(/^(pickup|delivery)Accessorials\.(.+)$/);
  if (accessorial) {
    return { control: form.querySelector(`input[name='${accessorial[1]}Accessorials'][value='${accessorial[2]}']`), value };
  }
  return { control: null, value };
}

function applyQuoteIntakeToForm() {
  const parsed = state.quoteIntake;
  const form = document.getElementById("quoteForm");
  if (!parsed || !form) {
    return;
  }
  const plan = quoteIntakeApplicationPlan(form, parsed);
  if (plan.conflictCount && !window.confirm(t("Applying this import will replace {count} non-empty field(s). Continue?", { count: plan.conflictCount }))) {
    return;
  }

  let applied = 0;
  plan.targets.forEach((target) => {
    const controlTarget = quoteIntakeControlTarget(form, target.target, target.value);
    if (target.addOption) {
      ensureQuoteIntakeSelectOption(controlTarget.control, target.value);
    }
    if (setControlThroughEvents(controlTarget.control, target.value)) {
      applied += 1;
    }
  });
  document.querySelectorAll(".accessorial-dropdown").forEach((details) => syncAccessorialDropdown(details));
  updateFreightClassSuggestion();
  clearQuoteFormErrors(form);
  showToast(t("Smart intake applied {count} field(s).", { count: applied }));
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
  enhanceAccessorialDropdowns();
  document.querySelectorAll(".accessorial-dropdown").forEach((details) => {
    const update = () => {
      syncAccessorialDropdown(details);
    };

    details.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
      checkbox.addEventListener("change", update);
    });
    update();
  });
}

function enhanceAccessorialDropdowns() {
  document.querySelectorAll(".accessorial-dropdown").forEach((details) => {
    const group = details.dataset.accessorialGroup === "delivery" ? "delivery" : "pickup";
    details.querySelectorAll("label").forEach((label) => {
      const checkbox = label.querySelector("input[type='checkbox']");
      if (!checkbox) {
        return;
      }
      const key = checkbox.value;
      const labelText = accessorialLabel(key, state.language);
      const helpText = accessorialExplanation(key, group, state.language);
      checkbox.dataset.label = labelText;
      label.classList.add("accessorial-option");
      label.innerHTML = "";
      label.appendChild(checkbox);
      label.insertAdjacentHTML(
        "beforeend",
        `
          <span class="accessorial-option-body">
            <span class="accessorial-option-line">
              <span class="accessorial-option-label">${escapeHtml(labelText)}</span>
              <button class="accessorial-help-button" type="button" aria-label="${escapeHtml(labelText)} ${escapeHtml(t("Details"))}" aria-expanded="false" aria-describedby="accessorialTooltip" data-accessorial-help-toggle>i</button>
            </span>
          </span>
        `
      );
      const button = label.querySelector("[data-accessorial-help-toggle]");
      if (button) {
        button.dataset.tooltipText = helpText;
      }
    });

    details.querySelectorAll("[data-accessorial-help-toggle]").forEach((button) => {
      if (button.dataset.helpBound === "true") {
        return;
      }
      button.addEventListener("pointerdown", (event) => {
        button.dataset.lastPointerType = event.pointerType || "";
      });
      button.addEventListener("pointerenter", (event) => {
        if (event.pointerType !== "touch") {
          showAccessorialTooltip(button);
        }
      });
      button.addEventListener("pointerleave", (event) => {
        if (event.pointerType !== "touch") {
          hideAccessorialTooltip(button);
        }
      });
      button.addEventListener("focus", () => {
        if (button.dataset.lastPointerType === "touch") {
          return;
        }
        showAccessorialTooltip(button);
      });
      button.addEventListener("blur", () => {
        hideAccessorialTooltip(button);
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (accessorialTooltipState.button === button && button.dataset.lastPointerType === "touch") {
          hideAccessorialTooltip(button);
          return;
        }
        showAccessorialTooltip(button);
      });
      button.dataset.helpBound = "true";
    });

    const shell = details.closest(".accessorial-dropdown-shell");
    if (shell && !shell.querySelector(".accessorial-charge-notice")) {
      details.insertAdjacentHTML(
        "afterend",
        `<p class="helper-text accessorial-charge-notice">${escapeHtml(accessorialChargeNotice[state.language] || accessorialChargeNotice.en)}</p>`
      );
    } else if (shell) {
      const notice = shell.querySelector(".accessorial-charge-notice");
      if (notice) {
        notice.textContent = accessorialChargeNotice[state.language] || accessorialChargeNotice.en;
      }
    }
  });
  setupAccessorialTooltipDismissal();
}

function accessorialTooltipElement() {
  let tooltip = document.getElementById("accessorialTooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "accessorialTooltip";
    tooltip.className = "accessorial-tooltip hidden";
    tooltip.setAttribute("role", "tooltip");
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function showAccessorialTooltip(button) {
  const tooltip = accessorialTooltipElement();
  if (accessorialTooltipState.button && accessorialTooltipState.button !== button) {
    accessorialTooltipState.button.setAttribute("aria-expanded", "false");
  }
  accessorialTooltipState.button = button;
  tooltip.textContent = button.dataset.tooltipText || "";
  tooltip.classList.remove("hidden");
  button.setAttribute("aria-expanded", "true");
  positionAccessorialTooltip(button, tooltip);
}

function hideAccessorialTooltip(button = null) {
  if (button && accessorialTooltipState.button !== button) {
    return;
  }
  const tooltip = document.getElementById("accessorialTooltip");
  if (accessorialTooltipState.button) {
    accessorialTooltipState.button.setAttribute("aria-expanded", "false");
  }
  accessorialTooltipState.button = null;
  if (tooltip) {
    tooltip.classList.add("hidden");
  }
}

function positionAccessorialTooltip(button, tooltip) {
  const rect = button.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const margin = 12;
  const gap = 8;
  tooltip.style.maxWidth = "320px";
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";
  const tooltipRect = tooltip.getBoundingClientRect();
  const width = tooltipRect.width || 280;
  const height = tooltipRect.height || 40;
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(margin, Math.min(left, viewportWidth - width - margin));
  const belowTop = rect.bottom + gap;
  const aboveTop = rect.top - height - gap;
  const top = belowTop + height + margin <= viewportHeight ? belowTop : Math.max(margin, aboveTop);
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function setupAccessorialTooltipDismissal() {
  if (accessorialTooltipState.dismissalBound) {
    return;
  }
  document.addEventListener("pointerdown", (event) => {
    const tooltip = document.getElementById("accessorialTooltip");
    const button = accessorialTooltipState.button;
    if (!button) {
      return;
    }
    if (button.contains(event.target) || tooltip?.contains(event.target)) {
      return;
    }
    hideAccessorialTooltip();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideAccessorialTooltip();
    }
  });
  window.addEventListener("scroll", () => {
    if (accessorialTooltipState.button) {
      positionAccessorialTooltip(accessorialTooltipState.button, accessorialTooltipElement());
    }
  }, true);
  window.addEventListener("resize", () => {
    if (accessorialTooltipState.button) {
      positionAccessorialTooltip(accessorialTooltipState.button, accessorialTooltipElement());
    }
  });
  accessorialTooltipState.dismissalBound = true;
}

function syncAccessorialDropdown(details) {
  const summary = details.querySelector(".accessorial-summary");
  if (!summary) {
    return;
  }

  const selectedLabels = Array.from(details.querySelectorAll("input[type='checkbox']:checked"))
    .map((checkbox) => checkbox.dataset.label || accessorialLabel(checkbox.value, state.language));

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
