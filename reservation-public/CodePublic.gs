/** 公開準備版。初期状態は所有者限定。Turnstile設定後に所有者が公開を有効にします。 */
const SETTINGS = Object.freeze({
  calendarId: '', // 空欄なら現在テスト済みのメインカレンダー
  notificationEmail: 'adultcuriositylab@gmail.com',
  timeZone: 'Asia/Tokyo',
  minutes: 50,
  daysAhead: 90,
  siteUrl: 'https://adult-curiosity.pages.dev/',
  minimumSubmitIntervalSeconds: 60,
  maximumBookingsPerTenMinutes: 20
});


const SERVICES = Object.freeze({
  consultation: Object.freeze({label: 'お悩み相談', prices: Object.freeze({1: 5500, 2: 10000}),
    methods: Object.freeze(['対面', 'オンライン', 'チャット', '電話'])}),
  practical: Object.freeze({label: '実技レッスン', prices: Object.freeze({1: 22000, 2: 40000}),
    methods: Object.freeze(['対面'])})
});
// 2枠の間に休憩を入れる場合は10。現在の作業用設定は100分連続です。
const CANCELLATION_POLICY = "キャンセル・日時変更について\n\nご予約のキャンセル・日時変更をご希望の場合は、できるだけお早めにご連絡ください。\n\n・前日までのキャンセル：無料\n・当日のキャンセル：料金の50％\n・無断キャンセル：料金の100％\n・前日までの日時変更：無料\n\n「前日まで」は、ご予約日の前日23:59まで（日本時間）を指します。\n当日の日時変更は、当日キャンセルと同じ扱いとなり、料金の50％を申し受けます。\nキャンセル料は、運営から予約確定をご連絡したご予約に適用します。仮予約の段階ではキャンセル料はかかりません。\n\nやむを得ない事情がある場合は、個別にご相談ください。\n\n当研究所の都合によりカウンセリングを実施できなくなった場合は、お支払い済みの料金を全額返金いたします。";
const TWO_SESSION_BREAK_MINUTES = 0;
const PAYMENT_PREFERENCES = Object.freeze(['クレジットカード', 'PayPay', '現金']);

function service_(id, units = 1) {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(SERVICES, id) ||
      !Number.isInteger(units) || ![1, 2].includes(units)) return null;
  const base = SERVICES[id];
  if (!Object.prototype.hasOwnProperty.call(base.prices, units)) return null;
  return {label: base.label, methods: base.methods, units: units, minutes: units * 50,
    occupiedMinutes: units * 50 + (units === 2 ? TWO_SESSION_BREAK_MINUTES : 0), priceYen: base.prices[units]};
}

function priceLabel_(service) {
  return service.priceYen.toLocaleString('ja-JP') + '円（税込）';
}

function timeLabel_(data, service) {
  const start = new Date(data.date + 'T' + data.time + ':00+09:00');
  const end = new Date(start.getTime() + service.occupiedMinutes * 60000);
  return data.date + ' ' + data.time + '〜' + Utilities.formatDate(end, SETTINGS.timeZone, 'HH:mm') +
    '（' + service.minutes + '分・' + service.units + '枠' +
    (service.occupiedMinutes > service.minutes ? '・休憩' + (service.occupiedMinutes - service.minutes) + '分あり' : '') + '・日本時間）';
}

function reservationDetails_(data, service) {
  return '相談区分：' + service.label + '\n' +
    'ご予約時間：' + service.minutes + '分（' + service.units + '枠）\n' +
    '料金：' + priceLabel_(service) + '\n' +
    'お支払い方法のご希望：' + data.paymentPreference + '（未決済）\n' +
    (data.method === '対面' ? '希望駅：仮予約後、運営からメールで確認します。\n' : '') +
    'このフォームで決済は行われません。支払い方法・時期は運営からご案内します。';
}

function ownerOnly_() {
  if (publicAccessAllowed_()) return;
  const owner = Session.getEffectiveUser().getEmail();
  const caller = Session.getActiveUser().getEmail();
  if (!owner || !caller || owner !== caller) throw new Error('OWNER_ONLY');
}

function calendar_() {
  const calendar = SETTINGS.calendarId
    ? CalendarApp.getCalendarById(SETTINGS.calendarId)
    : CalendarApp.getDefaultCalendar();
  if (!calendar) throw new Error('CALENDAR_UNAVAILABLE');
  return calendar;
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return renderPublicBooking_(e);
}

// 別サイトからの直接POSTはこのテスト版では使用しません。
function doPost() {
  return json_({success: false, code: 'PRIVATE_TEST_ONLY', message: '所有者限定の予約ページからテストしてください。'});
}

// エディタで1回実行。予定の作成・通知メール送信はしません。
function checkSetup() {
  ownerOnly_();
  const calendar = calendar_();
  const quota = MailApp.getRemainingDailyQuota();
  console.log('接続先：' + calendar.getName());
  console.log('通知先：' + SETTINGS.notificationEmail);
  console.log('本日のメール送信可能宛先数：' + quota);
}

function day_(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('INVALID_DATE');
  const date = new Date(text + 'T00:00:00+09:00');
  if (isNaN(date.getTime()) || Utilities.formatDate(date, SETTINGS.timeZone, 'yyyy-MM-dd') !== text) throw new Error('INVALID_DATE');
  return date;
}

function inRange_(date) {
  const today = day_(Utilities.formatDate(new Date(), SETTINGS.timeZone, 'yyyy-MM-dd'));
  return date >= today && date.getTime() <= today.getTime() + SETTINGS.daysAhead * 86400000;
}

function busy_(event) {
  return event.getTransparency() !== CalendarApp.EventTransparency.TRANSPARENT;
}

function overlaps_(event, start, end) {
  return busy_(event) && event.getStartTime() < end && event.getEndTime() > start;
}

function getAvailability(request) {
  try {
    ownerOnly_();
    const dateText = typeof request === 'string' ? request : request && request.date;
    const method = typeof request === 'string' ? '' : request && request.method;
    if (typeof request !== 'string' && !['対面', 'オンライン', 'チャット', '電話'].includes(method)) {
      return invalid_('ご相談の方法を選んでください。');
    }
    const serviceId = typeof request === 'string' ? 'consultation' : (request.service || 'consultation');
    const units = typeof request === 'string' ? 1 : (request.units === undefined ? 1 : request.units);
    const service = service_(serviceId, units);
    if (!service || (method && !service.methods.includes(method))) return invalid_('この相談区分では、その相談方法を選べません。');
    const date = day_(dateText);
    if (!inRange_(date)) return {success: false, code: 'INVALID_DATE', message: '本日から90日先までの日付を選んでください。'};
    const events = calendar_().getEvents(date, new Date(date.getTime() + 86400000));
    const slots = [];
    const close = new Date(date.getTime() + 21 * 3600000);
    for (let hour = 10; hour <= 20; hour++) {
      const time = hour + ':00';
      const start = new Date(dateText + 'T' + time + ':00+09:00');
      const end = new Date(start.getTime() + service.occupiedMinutes * 60000);
      slots.push({time: time, available: Date.now() < date.getTime() - 4 * 3600000 && start.getTime() > Date.now() && end <= close && !events.some(event => blocksMethod_(event, start, end, method))});
    }
    return {success: true, date: dateText, method: method, service: serviceId, units: units, minutes: service.minutes, priceLabel: priceLabel_(service), slots: slots, bookingClosed: Date.now() >= date.getTime() - 4 * 3600000};
  } catch (_) {
    return {success: false, code: 'AVAILABILITY_ERROR', message: '空き状況を取得できませんでした。再度お試しください。'};
  }
}

function invalid_(message) { return {success: false, code: 'INVALID_INPUT', message: message}; }

function submitReservation(input) {
  let locked = false;
  const lock = LockService.getScriptLock();
  try {
    ownerOnly_();
    if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid_('入力内容を確認してください。');
    const data = {};
    for (const key of ['name', 'email', 'method', 'note', 'date', 'time', 'requestId', 'service', 'paymentPreference']) {
      if (typeof input[key] !== 'string') return invalid_('入力内容を確認してください。');
      data[key] = input[key].trim();
    }
    if (!data.name || data.name.length > 100 || /[\r\n]/.test(data.name) ||
        data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) ||
        !['対面', 'オンライン', 'チャット', '電話'].includes(data.method) ||
        data.note.length > 2000 || !/^(1[0-9]|20):00$/.test(data.time) ||
        !/^[a-f0-9-]{36}$/i.test(data.requestId) || (input.privacy !== true || input.cancellationConsent !== true)) return invalid_('入力内容と各ポリシーへの同意を確認してください。');
    data.units = input.units;
    const service = service_(data.service, data.units);
    if (!service || !service.methods.includes(data.method)) return invalid_('相談区分・枠数・相談方法の組み合わせを確認してください。実技レッスンは対面のみ、予約は最大2枠です。');
    if (!PAYMENT_PREFERENCES.includes(data.paymentPreference)) return invalid_('お支払い方法のご希望を選んでください。');
    let day;
    try { day = day_(data.date); } catch (_) { return invalid_('日付を確認してください。'); }
    const start = new Date(data.date + 'T' + data.time + ':00+09:00');
    const end = new Date(start.getTime() + service.occupiedMinutes * 60000);
    const fingerprint = Utilities.base64EncodeWebSafe(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify([data.name, data.email, data.method, data.note, data.date, data.time, data.service, data.paymentPreference, data.units]),
      Utilities.Charset.UTF_8));
    if (!lock.tryLock(10000)) return {success: false, code: 'BUSY', message: '混雑しています。少し待って、同じ内容で再度お試しください。'};
    locked = true;
    const properties = PropertiesService.getScriptProperties();
    const key = 'booking_' + data.requestId;
    let receipt = JSON.parse(properties.getProperty(key) || 'null');
    if (receipt && receipt.fingerprint !== fingerprint) return invalid_('受付番号と入力内容が一致しません。ページを開き直してください。');
    if (receipt && receipt.status === 'created') return success_(receipt);
    if (!inRange_(day) || start.getTime() <= Date.now()) return invalid_('本日から90日先までの、未来の日時を選んでください。');
    if (end > new Date(day.getTime() + 21 * 3600000)) return invalid_('終了が21:00を超えるため、別の開始時間を選んでください。');
    if (Date.now() >= day.getTime() - 4 * 3600000) return {success: false, code: 'BOOKING_CLOSED', message: 'この日の受付は終了しました。予約は日本時間で前日の20:00までです。別の日を選んでください。'};
    const calendar = calendar_();
    const events = calendar.getEvents(start, end);
    // 登録後に応答や保存が途切れても、同じ受付番号の予定を探して二重登録を防ぎます。
    const marker = 'ACL_REQUEST:' + data.requestId + ':' + fingerprint;
    const existing = events.find(event => (event.getDescription() || '').split('\n')[0] === marker);
    if (existing) {
      receipt = receipt || {fingerprint: fingerprint, reference: data.requestId, createdAt: Date.now()};
      receipt.status = 'created';
      receipt.notification = 'unknown';
      properties.setProperty(key, JSON.stringify(receipt));
      return success_(receipt);
    }
    if (events.some(event => blocksMethod_(event, start, end, data.method))) return {success: false, code: 'CONFLICT', message: 'その時間は予約できなくなりました。別の時間を選んでください。'};
    // 再送済み・重複・締切の判定後、新しい予約だけに適用します。
    if (MailApp.getRemainingDailyQuota() < 2) {
      return {success: false, code: 'SERVICE_UNAVAILABLE', message: 'ただいま予約の受付を一時停止しています。運営へメールでお問い合わせください。'};
    }
    const limited = reserveSubmissionAllowance_(properties, data.email);
    if (limited) return limited;
    cleanupReceipts_(properties);
    receipt = {fingerprint: fingerprint, reference: data.requestId, displayReference: newDisplayReference_(properties, data.date), status: 'pending', notification: 'unknown', createdAt: Date.now()};
    properties.setProperty(key, JSON.stringify(receipt));
    const event = calendar.createEvent('【仮予約】' + service.label + '／' + data.name, start, end, {
      description: marker + '\n受付番号：' + receipt.displayReference + '\n' + reservationDetails_(data, service) + '\n相談方法：' + data.method + '\nお名前：' + data.name + '\nメール：' + data.email + '\n事前相談：' + data.note
    });
    event.setVisibility(CalendarApp.Visibility.PRIVATE);
    receipt.status = 'created';
    properties.setProperty(key, JSON.stringify(receipt));
    try {
      MailApp.sendEmail({to: SETTINGS.notificationEmail, replyTo: data.email,
        subject: '【大人の自由研究所】仮予約受付',
        body: reservationDetails_(data, service) + '\n\n' + '仮予約が入りました。予約確定は手動です。\n\n受付番号：' + (receipt.displayReference || receipt.reference) + '\n日時：' + timeLabel_(data, service) + '\n相談方法：' + data.method + '\nお名前：' + data.name + '\nメール：' + data.email + '\n事前相談：' + data.note});
      receipt.notification = 'sent';
    } catch (_) { receipt.notification = 'failed'; }
    // お客様へのメールも運営通知とは独立して送信します。
    // メールだけ失敗してもカレンダーの仮予約は取り消しません。
    receipt.customerNotification = 'unknown';
    properties.setProperty(key, JSON.stringify(receipt));
    try {
      MailApp.sendEmail({
        to: data.email,
        replyTo: SETTINGS.notificationEmail,
        name: '大人の自由研究所',
        subject: '【大人の自由研究所】仮予約を受け付けました（予約未確定）',
        body: data.name + ' 様\n\n' +
          '大人の自由研究所へのお申し込みありがとうございます。\n' +
          '以下の内容で仮予約を受け付けました。\n\n' +
          '【まだ予約は確定していません】\n' +
          '運営からの連絡をもって予約確定となります。\n\n' +
          'ご希望日時：' + timeLabel_(data, service) + '\n' +
          '相談方法：' + data.method + '\n' +
          reservationDetails_(data, service) + '\n\n' +
          '受付番号：' + (receipt.displayReference || receipt.reference) + '\n\n' +
          CANCELLATION_POLICY + '\n\n変更・キャンセルをご希望の場合は、このメールにご返信ください。\n' +
          'お申し込みにお心当たりがない場合も、このメールにご返信ください。\n\n' +
          '大人の自由研究所\n' + SETTINGS.notificationEmail + '\n\n' +
          'このメールでは予約は確定していません。運営からの連絡をお待ちください。'
      });
      receipt.customerNotification = 'sent';
    } catch (_) {
      receipt.customerNotification = 'failed';
    }
    properties.setProperty(key, JSON.stringify(receipt));
    return success_(receipt);
  } catch (_) {
    return {success: false, code: 'UNKNOWN_RESULT', message: '受付結果を確認できません。同じ内容・同じ画面のまま再確認してください。'};
  } finally { if (locked) lock.releaseLock(); }
}

function success_(receipt) {
  return {success: true, code: 'ACCEPTED', reference: receipt.reference, displayReference: receipt.displayReference || receipt.reference, notification: receipt.notification, customerNotification: receipt.customerNotification || 'unknown',
    message: '仮予約を受け付けました。予約確定ではありません。運営からの連絡をお待ちください。'};
}

function cleanupReceipts_(properties) {
  const entries = properties.getProperties();
  const cutoff = Date.now() - 100 * 86400000;
  Object.keys(entries).filter(key => key.startsWith('booking_')).forEach(key => {
    try { if (JSON.parse(entries[key]).createdAt < cutoff) properties.deleteProperty(key); } catch (_) {}
  });
}

/** 表示用番号だけ短くする。内部のrequestIdは変更しません。 */
function newDisplayReference_(properties, dateText) {
  const used = new Set();
  Object.keys(properties.getProperties()).filter(key => key.startsWith('booking_')).forEach(key => {
    try {
      const saved = JSON.parse(properties.getProperty(key));
      if (saved.displayReference) used.add(saved.displayReference);
    } catch (_) {}
  });
  for (let attempt = 0; attempt < 20; attempt++) {
    const suffix = Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
    const reference = dateText.replace(/-/g, '') + '-' + suffix;
    if (!used.has(reference)) return reference;
  }
  throw new Error('REFERENCE_UNAVAILABLE');
}

/** 公開準備用の基本的な連続登録制限。所有者限定の制限は解除していません。 */
function reserveSubmissionAllowance_(properties, email) {
  const now = Date.now();
  const emailHash = Utilities.base64EncodeWebSafe(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, email.toLowerCase(), Utilities.Charset.UTF_8));
  const emailKey = 'rate_email_' + emailHash;
  const previous = Number(properties.getProperty(emailKey) || 0);
  if (previous && now - previous < SETTINGS.minimumSubmitIntervalSeconds * 1000) {
    return {success: false, code: 'RATE_LIMIT', message: '続けてのお申し込みは、1分ほど待ってからお試しください。'};
  }
  const bucket = Math.floor(now / 600000);
  const globalKey = 'rate_window_' + bucket;
  const count = Number(properties.getProperty(globalKey) || 0);
  if (count >= SETTINGS.maximumBookingsPerTenMinutes) {
    return {success: false, code: 'RATE_LIMIT', message: 'ただいまお申し込みが集中しています。時間をおいて再度お試しください。'};
  }
  properties.setProperty(emailKey, String(now));
  properties.setProperty(globalKey, String(count + 1));
  const all = properties.getProperties();
  Object.keys(all).forEach(key => {
    if (key.startsWith('rate_email_') && now - Number(all[key]) > 86400000) properties.deleteProperty(key);
    if (key.startsWith('rate_window_') && Number(key.slice('rate_window_'.length)) < bucket - 1) properties.deleteProperty(key);
  });
  return null;
}

/**
 * 「【対面NG】」で始まる予定は対面だけを止めます。
 * 通常の予定・仮予約は全方法を止めます。予定の詳細は予約者へ返しません。
 */
function blocksMethod_(event, start, end, method) {
  if (!overlaps_(event, start, end)) return false;
  if ((event.getTitle() || '').startsWith('【対面NG】')) {
    return !method || method === '対面';
  }
  return true;
}


/** 既存Code.gsと一緒に追加する公開用の入口。初期状態は所有者限定。 */
var publicBookingContext_ = false;
function publicAccessAllowed_() { return publicBookingContext_ === true; }
function requireBookingOwner_() {
  const owner = Session.getEffectiveUser().getEmail();
  const caller = Session.getActiveUser().getEmail();
  if (!owner || !caller || owner !== caller) throw new Error('OWNER_ONLY');
}
function bookingPublicSettings_() {
  const p = PropertiesService.getScriptProperties();
  const siteKey = p.getProperty('TURNSTILE_SITE_KEY') || '';
  const secretKey = p.getProperty('TURNSTILE_SECRET_KEY') || '';
  const hostname = (p.getProperty('TURNSTILE_HOSTNAME') || '').toLowerCase();
  const enabled = p.getProperty('PUBLIC_BOOKINGS') === 'true';
  const ready = /^[A-Za-z0-9_-]{10,200}$/.test(siteKey) && /^[A-Za-z0-9_-]{10,200}$/.test(secretKey) &&
    !/^[123]x0+/.test(siteKey) && !/^[123]x0+/.test(secretKey) &&
    /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.googleusercontent\.com$/.test(hostname);
  return {enabled: enabled, ready: ready, siteKey: siteKey, secretKey: secretKey, hostname: hostname};
}
function renderPublicBooking_(e) {
  const cfg = bookingPublicSettings_();
  if (!cfg.enabled) requireBookingOwner_();
  if (cfg.enabled && !cfg.ready) return HtmlService.createHtmlOutput('予約の受付を一時停止しています。運営へメールでお問い合わせください。');
  const template = HtmlService.createTemplateFromFile('BookingPublic');
  template.siteUrl = SETTINGS.siteUrl;
  template.publicMode = cfg.enabled;
  template.turnstileSiteKey = cfg.enabled ? cfg.siteKey : '';
  return template.evaluate().addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setTitle('カウンセリングのご予約｜大人の自由研究所');
}
function publicAvailability(request) {
  const cfg = bookingPublicSettings_();
  if (!cfg.enabled) requireBookingOwner_();
  if (cfg.enabled && !cfg.ready) return {success: false, code: 'SERVICE_UNAVAILABLE', message: '予約の受付を一時停止しています。'};
  publicBookingContext_ = true;
  try { return getAvailability(request); } finally { publicBookingContext_ = false; }
}
function verifyBookingChallenge_(input, cfg) {
  if (!input || typeof input.turnstileToken !== 'string' || !input.turnstileToken || input.turnstileToken.length > 2048)
    return {success: false, code: 'VERIFICATION_REQUIRED', message: '人による操作の確認を完了してから、もう一度お申し込みください。'};
  try {
    const response = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'post', payload: {secret: cfg.secretKey, response: input.turnstileToken}, muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) throw new Error('VERIFY_UNAVAILABLE');
    const result = JSON.parse(response.getContentText());
    if (result.success !== true || result.action !== 'booking' || result.cdata !== input.requestId || result.hostname !== cfg.hostname)
      return {success: false, code: 'VERIFICATION_REQUIRED', message: '人による操作の確認が切れたか、確認できませんでした。再確認してお申し込みください。'};
    return null;
  } catch (_) { return {success: false, code: 'VERIFICATION_UNAVAILABLE', message: '操作の確認に接続できません。少し待って再度お試しください。'}; }
}
function publicReservation(input) {
  const cfg = bookingPublicSettings_();
  if (!cfg.enabled) requireBookingOwner_();
  if (cfg.enabled && !cfg.ready) return {success: false, code: 'SERVICE_UNAVAILABLE', message: '予約の受付を一時停止しています。'};
  if (cfg.enabled) {
    if (!input || typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.requestId)) return invalid_('入力内容を確認してください。');
    // 同じ内容で受付済みかどうかは、既存処理がハッシュと受付記録を照合する。
    // 受付済みの再確認は、新しいチャレンジやメールを必要としない。
    const saved = PropertiesService.getScriptProperties().getProperty('booking_' + input.requestId);
    let accepted = false;
    try { accepted = saved && JSON.parse(saved).status === 'created'; } catch (_) {}
    if (!accepted) {
      const failure = verifyBookingChallenge_(input, cfg);
      if (failure) return failure;
    }
  }
  publicBookingContext_ = true;
  try { return submitReservation(input); } finally { publicBookingContext_ = false; }
}
// スクリプトエディタで実行。公開設定の変更は所有者のみ。
function enablePublicBookings() {
  requireBookingOwner_();
  const cfg = bookingPublicSettings_();
  if (!cfg.ready) throw new Error('TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY / TURNSTILE_HOSTNAME を設定してください。本番キーと予約ページの正確なホスト名が必要です。');
  PropertiesService.getScriptProperties().setProperty('PUBLIC_BOOKINGS', 'true');
  console.log('公開モードを有効にしました。ウェブアプリのアクセス設定と匿名テストを確認してください。');
}
function disablePublicBookings() {
  requireBookingOwner_();
  PropertiesService.getScriptProperties().setProperty('PUBLIC_BOOKINGS', 'false');
  console.log('所有者限定モードに戻しました。');
}
