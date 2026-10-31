/** 所有者限定テスト版。一般公開用ではありません。既存コードをバックアップしてから使用。 */
const SETTINGS = Object.freeze({
  calendarId: '', // 空欄なら現在テスト済みのメインカレンダー
  notificationEmail: 'adultcuriositylab@gmail.com',
  timeZone: 'Asia/Tokyo',
  minutes: 50,
  daysAhead: 90,
  siteUrl: 'https://adultcuriositylab.netlify.app/'
});

function ownerOnly_() {
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
  try {
    ownerOnly_();
    if (e && e.parameter && e.parameter.date) {
      return json_(getAvailability(e.parameter.date));
    }
    const template = HtmlService.createTemplateFromFile('Booking');
    template.siteUrl = SETTINGS.siteUrl;
    return template.evaluate()
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setTitle('カウンセリングのご予約｜大人の自由研究所');
  } catch (_) {
    return HtmlService.createHtmlOutput('所有者限定のテストページです。作成したGoogleアカウントで開いてください。');
  }
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

function getAvailability(dateText) {
  try {
    ownerOnly_();
    const date = day_(dateText);
    if (!inRange_(date)) return {success: false, code: 'INVALID_DATE', message: '本日から90日先までの日付を選んでください。'};
    const events = calendar_().getEvents(date, new Date(date.getTime() + 86400000));
    const slots = [];
    for (let hour = 10; hour <= 20; hour++) {
      const time = hour + ':00';
      const start = new Date(dateText + 'T' + time + ':00+09:00');
      const end = new Date(start.getTime() + SETTINGS.minutes * 60000);
      slots.push({time: time, available: start.getTime() > Date.now() && !events.some(event => overlaps_(event, start, end))});
    }
    return {success: true, date: dateText, slots: slots};
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
    for (const key of ['name', 'email', 'method', 'note', 'date', 'time', 'requestId']) {
      if (typeof input[key] !== 'string') return invalid_('入力内容を確認してください。');
      data[key] = input[key].trim();
    }
    if (!data.name || data.name.length > 100 || /[\r\n]/.test(data.name) ||
        data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) ||
        !['対面', 'オンライン', 'チャット', '電話'].includes(data.method) ||
        data.note.length > 2000 || !/^(1[0-9]|20):00$/.test(data.time) ||
        !/^[a-f0-9-]{36}$/i.test(data.requestId) || input.privacy !== true) return invalid_('入力内容とプライバシーポリシーへの同意を確認してください。');
    let day;
    try { day = day_(data.date); } catch (_) { return invalid_('日付を確認してください。'); }
    const start = new Date(data.date + 'T' + data.time + ':00+09:00');
    const end = new Date(start.getTime() + SETTINGS.minutes * 60000);
    const fingerprint = Utilities.base64EncodeWebSafe(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify([data.name, data.email, data.method, data.note, data.date, data.time]),
      Utilities.Charset.UTF_8));
    if (!lock.tryLock(10000)) return {success: false, code: 'BUSY', message: '混雑しています。少し待って、同じ内容で再度お試しください。'};
    locked = true;
    const properties = PropertiesService.getScriptProperties();
    const key = 'booking_' + data.requestId;
    let receipt = JSON.parse(properties.getProperty(key) || 'null');
    if (receipt && receipt.fingerprint !== fingerprint) return invalid_('受付番号と入力内容が一致しません。ページを開き直してください。');
    if (receipt && receipt.status === 'created') return success_(receipt);
    if (!inRange_(day) || start.getTime() <= Date.now()) return invalid_('本日から90日先までの、未来の日時を選んでください。');
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
    if (events.some(event => overlaps_(event, start, end))) return {success: false, code: 'CONFLICT', message: 'その時間は予約できなくなりました。別の時間を選んでください。'};
    cleanupReceipts_(properties);
    receipt = {fingerprint: fingerprint, reference: data.requestId, status: 'pending', notification: 'unknown', createdAt: Date.now()};
    properties.setProperty(key, JSON.stringify(receipt));
    const event = calendar.createEvent('【仮予約・テスト】' + data.name, start, end, {
      description: marker + '\n受付番号：' + data.requestId + '\n相談方法：' + data.method + '\nお名前：' + data.name + '\nメール：' + data.email + '\n事前相談：' + data.note
    });
    event.setVisibility(CalendarApp.Visibility.PRIVATE);
    receipt.status = 'created';
    properties.setProperty(key, JSON.stringify(receipt));
    try {
      MailApp.sendEmail({to: SETTINGS.notificationEmail, replyTo: data.email,
        subject: '【大人の自由研究所】仮予約受付テスト',
        body: '所有者限定テストから仮予約が入りました。予約確定は手動です。\n\n受付番号：' + receipt.reference + '\n日時：' + data.date + ' ' + data.time + '〜（50分・日本時間）\n相談方法：' + data.method + '\nお名前：' + data.name + '\nメール：' + data.email + '\n事前相談：' + data.note});
      receipt.notification = 'sent';
    } catch (_) { receipt.notification = 'failed'; }
    properties.setProperty(key, JSON.stringify(receipt));
    return success_(receipt);
  } catch (_) {
    return {success: false, code: 'UNKNOWN_RESULT', message: '受付結果を確認できません。同じ内容・同じ画面のまま再確認してください。'};
  } finally { if (locked) lock.releaseLock(); }
}

function success_(receipt) {
  return {success: true, code: 'ACCEPTED', reference: receipt.reference, notification: receipt.notification,
    message: '仮予約を受け付けました。予約確定ではありません。運営からの連絡をお待ちください。'};
}

function cleanupReceipts_(properties) {
  const entries = properties.getProperties();
  const cutoff = Date.now() - 100 * 86400000;
  Object.keys(entries).filter(key => key.startsWith('booking_')).forEach(key => {
    try { if (JSON.parse(entries[key]).createdAt < cutoff) properties.deleteProperty(key); } catch (_) {}
  });
}
