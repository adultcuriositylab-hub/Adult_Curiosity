(() => {
  const form = document.getElementById('reservation');
  const date = document.getElementById('date');
  const serviceInputs = [...form.querySelectorAll('input[name="service"]')];
  const methodInputs = [...form.querySelectorAll('input[name="method"]')];
  const serviceCatalog = {
    consultation: {label: 'お悩み相談', prices: {1: '5,500円（税込）', 2: '10,000円（税込）'}, methods: ['対面', 'オンライン', 'チャット', '電話']},
    practical: {label: '実技レッスン', prices: {1: '22,000円（税込）', 2: '40,000円（税込）'}, methods: ['対面']}
  };
  const unitInputs = [...form.querySelectorAll('input[name="units"]')];
  const chosenUnits = () => Number(form.querySelector('input[name="units"]:checked')?.value || 0);
  const occupiedMinutes = units => units * 50;
  const endLabel = (day, time, units) => new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date(new Date(day + 'T' + time + ':00+09:00').getTime() + occupiedMinutes(units) * 60000));
  const chosenService = () => form.querySelector('input[name="service"]:checked')?.value || '';
  const timeInputs = [...form.querySelectorAll('input[name="time"]')];
  const status = document.getElementById('availability-status');
  const reload = document.getElementById('reload-slots');
  const review = document.getElementById('review');
  const confirmation = document.getElementById('confirmation');
  const send = document.getElementById('send');
  const edit = document.getElementById('edit');
  const sendStatus = document.getElementById('send-status');
  const accepted = document.getElementById('accepted');
  let sequence = 0, readyDate = '', readyMethod = '', readyService = '', readyUnits = 0, snapshot = null, pending = null;
  let lastFingerprint = '', requestId = '', sending = false;
  const jst = value => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(value);
  const today = jst(new Date());
  date.min = today;
  date.max = jst(new Date(new Date(today + 'T00:00:00+09:00').getTime() + 90 * 86400000));

  function rpc(name, arg, timeout = 30000) {
    return new Promise((resolve, reject) => {
      if (!window.google || !google.script || !google.script.run) {
        reject(new Error('OPEN_GAS_PAGE')); return;
      }
      const timer = setTimeout(() => reject(new Error('TIMEOUT')), timeout);
      const runner = google.script.run
        .withSuccessHandler(value => { clearTimeout(timer); resolve(value); })
        .withFailureHandler(() => { clearTimeout(timer); reject(new Error('CONNECTION_ERROR')); });
      runner[name](arg);
    });
  }

  function notice(node, text, error = false) {
    node.textContent = text;
    node.dataset.error = String(error);
  }

  function resetTimes() {
    readyDate = ''; readyMethod = ''; readyService = ''; readyUnits = 0;
    timeInputs.forEach(input => { input.disabled = true; input.checked = false; });
    review.disabled = true;
  }

  async function loadSlots() {
    const current = ++sequence;
    const selectedDate = date.value;
    const selectedService = chosenService();
    const selectedUnits = chosenUnits();
    const selectedMethod = form.querySelector('input[name="method"]:checked')?.value || '';
    resetTimes(); reload.hidden = true;
    if (!selectedService) { notice(status, '先に相談区分を選んでください。'); return; }
    if (!selectedUnits) { notice(status, 'ご希望の枠数を選んでください。'); return; }
    if (!selectedMethod) { notice(status, '先にご相談の方法を選んでください。'); return; }
    if (!selectedDate) { notice(status, '日付を選んでください。'); return; }
    if (selectedDate < date.min || selectedDate > date.max) {
      notice(status, '本日から90日先までの日付を選んでください。', true); return;
    }
    notice(status, '空き状況を確認しています…');
    try {
      const result = await rpc('getAvailability', {date: selectedDate, method: selectedMethod, service: selectedService, units: selectedUnits});
      if (current !== sequence || chosenUnits() !== selectedUnits || chosenService() !== selectedService || date.value !== selectedDate || form.querySelector('input[name="method"]:checked')?.value !== selectedMethod) return;
      if (!result || result.success !== true || result.date !== selectedDate || result.method !== selectedMethod || result.service !== selectedService || result.units !== selectedUnits ||
          !Array.isArray(result.slots) || result.slots.length !== 11) throw new Error('BAD_RESPONSE');
      const slots = new Map();
      result.slots.forEach(slot => {
        if (!slot || !/^(1[0-9]|20):00$/.test(slot.time) || typeof slot.available !== 'boolean' || slots.has(slot.time)) throw new Error('BAD_RESPONSE');
        slots.set(slot.time, slot.available);
      });
      let count = 0;
      timeInputs.forEach(input => {
        const future = new Date(selectedDate + 'T' + input.value + ':00+09:00').getTime() > Date.now();
        input.disabled = slots.get(input.value) !== true || !future;
        input.setAttribute('aria-label', input.value + (input.disabled ? ' 予約不可' : ' 予約可能'));
        if (!input.disabled) count++;
      });
      readyDate = selectedDate; readyMethod = selectedMethod; readyService = selectedService; readyUnits = selectedUnits;
      review.disabled = count === 0;
      notice(status, result.bookingClosed === true ? 'この日の受付は終了しました。前日の20:00までにお申し込みください。' : count ? 'ご希望の時間を選んでください。薄い表示の枠は予約できません。' : 'この日は予約できる時間がありません。別の日を選んでください。');
      reload.hidden = false;
    } catch (error) {
      if (current !== sequence || chosenUnits() !== selectedUnits || chosenService() !== selectedService || date.value !== selectedDate || form.querySelector('input[name="method"]:checked')?.value !== selectedMethod) return;
      resetTimes(); reload.hidden = false;
      notice(status, error.message === 'OPEN_GAS_PAGE'
        ? 'Apps Scriptのテスト用URLでこのページを開いてください。'
        : '空き状況を取得できませんでした。「再取得する」を押してください。', true);
    }
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
    return hex.slice(0,8) + '-' + hex.slice(8,12) + '-' + hex.slice(12,16) + '-' + hex.slice(16,20) + '-' + hex.slice(20);
  }

  date.addEventListener('input', () => {
    date.setCustomValidity('');
    date.parentElement.classList.toggle('has-date', !!date.value);
    loadSlots();
  });
  date.parentElement.classList.toggle('has-date', !!date.value);
  serviceInputs.forEach(input => input.addEventListener('change', () => {
    const service = serviceCatalog[chosenService()];
    methodInputs.forEach(method => {
      method.disabled = !service || !service.methods.includes(method.value);
      if (method.disabled) method.checked = false;
    });
    if (chosenService() === 'practical') methodInputs.find(input => input.value === '対面').checked = true;
    document.getElementById('service-method-note').textContent = chosenService() === 'practical'
      ? '実技レッスンは対面のみです。希望駅は仮予約後にメールで確認します。'
      : '対面をご希望の場合、希望駅は仮予約後にメールで確認します。';
    unitInputs.forEach(unit => {
      unit.disabled = !service || !service.prices[Number(unit.value)];
      if (unit.disabled) unit.checked = false;
    });
    if (!unitInputs.some(unit => unit.checked)) unitInputs.find(unit => unit.value === '1').checked = true;
    loadSlots();
  }));
  form.querySelectorAll('input[name="method"]').forEach(input => input.addEventListener('change', loadSlots));
  unitInputs.forEach(input => input.addEventListener('change', loadSlots));
  reload.addEventListener('click', loadSlots);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity() || readyService !== chosenService() || readyUnits !== chosenUnits() || readyDate !== date.value || readyMethod !== form.querySelector('input[name="method"]:checked')?.value) return;
    const data = new FormData(form);
    const time = data.get('time');
    if (!timeInputs.some(input => input.value === time && input.checked && !input.disabled)) return;
    if (new Date(date.value + 'T' + time + ':00+09:00').getTime() <= Date.now()) {
      loadSlots(); notice(status, '選んだ開始時間を過ぎました。別の時間を選んでください。', true); return;
    }
    snapshot = {
      name: String(data.get('name') || '').trim(), email: String(data.get('email') || '').trim(),
      service: chosenService(), units: chosenUnits(), paymentPreference: data.get('paymentPreference'),
      method: data.get('method'), note: String(data.get('message') || '').trim(),
      date: date.value, time: time, privacy: data.get('privacy') === 'on'
    };
    const fingerprint = JSON.stringify(snapshot);
    if (fingerprint !== lastFingerprint) { requestId = uuid(); lastFingerprint = fingerprint; }
    snapshot.requestId = requestId;
    const summary = document.getElementById('summary'); summary.replaceChildren();
    [['相談区分', serviceCatalog[snapshot.service].label], ['料金のご案内', serviceCatalog[snapshot.service].prices[snapshot.units]],
      ['お支払い方法のご希望', snapshot.paymentPreference + '（未決済）'], ['ご相談の方法', snapshot.method], ['ご希望の日にち', snapshot.date],
      ['ご希望の時間', snapshot.time + '〜' + endLabel(snapshot.date, snapshot.time, snapshot.units) + '（' + snapshot.units * 50 + '分・' + snapshot.units + '枠・日本時間）'], ['お名前', snapshot.name],
      ['メールアドレス', snapshot.email], ['事前に伝えておきたい内容', snapshot.note || '記入なし']]
      .forEach(([label, value]) => {
        const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = label; dd.textContent = value; row.append(dt, dd); summary.append(row);
      });
    document.getElementById('confirmation-service-note').textContent =
      '' +
      (snapshot.method === '対面' ? '希望駅は運営からメールで確認します。' : '') +
      '支払い方法・時期は運営からご案内します。このフォームでは決済しません。';
    notice(sendStatus, ''); send.disabled = false; edit.disabled = false;
    send.textContent = '仮予約を申し込む';
    document.getElementById('cancellation-consent').checked = false;
    form.hidden = true; confirmation.hidden = false;
    confirmation.focus(); confirmation.scrollIntoView({block: 'start'});
  });

  edit.addEventListener('click', () => {
    if (sending || pending) return;
    confirmation.hidden = true; form.hidden = false; loadSlots(); date.focus();
  });

  send.addEventListener('click', async () => {
    if (sending || !snapshot) return;
    const consent = document.getElementById('cancellation-consent');
    if (!pending && !consent.reportValidity()) return;
    snapshot.cancellationConsent = true;
    sending = true; send.disabled = true; edit.disabled = true;
    pending = pending || {...snapshot};
    notice(sendStatus, '受付を確認しています。ページを閉じずにお待ちください。');
    try {
      const result = await rpc('submitReservation', pending, 45000);
      if (result && result.success === true && result.code === 'ACCEPTED' && result.reference === pending.requestId) {
        document.getElementById('receipt').textContent = '受付番号：' + (result.displayReference || result.reference);
        const ownerMail = result.notification === 'sent'
          ? '運営への通知メールを送信しました。'
          : '運営への通知メールは失敗、または送信状況を確認できません。';
        const customerMail = result.customerNotification === 'sent'
          ? 'ご入力のメールアドレスへ仮予約受付メールを送信しました。迷惑メールフォルダもご確認ください。'
          : '仮予約は登録されていますが、受付メールは送信失敗、または送信状況を確認できません。受付番号を控え、運営へお問い合わせください。';
        document.getElementById('notification-note').textContent = ownerMail + ' ' + customerMail;
        pending = null; confirmation.hidden = true; accepted.hidden = false;
        accepted.focus(); accepted.scrollIntoView({block: 'start'}); return;
      }
      const known = result && result.success === false && ['CONFLICT','INVALID_INPUT','BUSY','BOOKING_CLOSED','RATE_LIMIT','SERVICE_UNAVAILABLE'].includes(result.code);
      if (known) {
        pending = null;
        notice(sendStatus, result.message, true);
        edit.disabled = false;
        send.disabled = !['BUSY', 'RATE_LIMIT'].includes(result.code);
        if (['BUSY', 'RATE_LIMIT'].includes(result.code)) send.textContent = '同じ内容で再度申し込む';
        return;
      }
      throw new Error('UNKNOWN_RESULT');
    } catch (_) {
      notice(sendStatus, '受付結果を確認できません。この画面を閉じずに「同じ申し込みの結果を再確認する」を押してください。重複を防ぐため同じ受付番号で確認します。', true);
      send.textContent = '同じ申し込みの結果を再確認する';
      send.disabled = false;
      // 結果不明時は内容を変えて再送させません。
    } finally { sending = false; }
  });

  if (date.value) loadSlots();
})();

