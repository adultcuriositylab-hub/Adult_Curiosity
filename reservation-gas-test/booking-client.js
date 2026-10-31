(() => {
  const form = document.getElementById('reservation');
  const date = document.getElementById('date');
  const timeInputs = [...form.querySelectorAll('input[name="time"]')];
  const status = document.getElementById('availability-status');
  const reload = document.getElementById('reload-slots');
  const review = document.getElementById('review');
  const confirmation = document.getElementById('confirmation');
  const send = document.getElementById('send');
  const edit = document.getElementById('edit');
  const sendStatus = document.getElementById('send-status');
  const accepted = document.getElementById('accepted');
  let sequence = 0, readyDate = '', snapshot = null, pending = null;
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
    readyDate = '';
    timeInputs.forEach(input => { input.disabled = true; input.checked = false; });
    review.disabled = true;
  }

  async function loadSlots() {
    const current = ++sequence;
    const selectedDate = date.value;
    resetTimes(); reload.hidden = true;
    if (!selectedDate) { notice(status, '日付を選んでください。'); return; }
    if (selectedDate < date.min || selectedDate > date.max) {
      notice(status, '本日から90日先までの日付を選んでください。', true); return;
    }
    notice(status, '空き状況を確認しています…');
    try {
      const result = await rpc('getAvailability', selectedDate);
      if (current !== sequence || date.value !== selectedDate) return;
      if (!result || result.success !== true || result.date !== selectedDate ||
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
      readyDate = selectedDate;
      review.disabled = count === 0;
      notice(status, count ? 'ご希望の時間を選んでください。薄い表示の枠は予約できません。' : 'この日は予約できる時間がありません。別の日を選んでください。');
      reload.hidden = false;
    } catch (error) {
      if (current !== sequence || date.value !== selectedDate) return;
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
  reload.addEventListener('click', loadSlots);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity() || readyDate !== date.value) return;
    const data = new FormData(form);
    const time = data.get('time');
    if (!timeInputs.some(input => input.value === time && input.checked && !input.disabled)) return;
    if (new Date(date.value + 'T' + time + ':00+09:00').getTime() <= Date.now()) {
      loadSlots(); notice(status, '選んだ開始時間を過ぎました。別の時間を選んでください。', true); return;
    }
    snapshot = {
      name: String(data.get('name') || '').trim(), email: String(data.get('email') || '').trim(),
      method: data.get('method'), note: String(data.get('message') || '').trim(),
      date: date.value, time: time, privacy: data.get('privacy') === 'on'
    };
    const fingerprint = JSON.stringify(snapshot);
    if (fingerprint !== lastFingerprint) { requestId = uuid(); lastFingerprint = fingerprint; }
    snapshot.requestId = requestId;
    const summary = document.getElementById('summary'); summary.replaceChildren();
    [['ご相談の方法', snapshot.method], ['ご希望の日にち', snapshot.date],
      ['ご希望の時間', snapshot.time + '〜（50分・日本時間）'], ['お名前', snapshot.name],
      ['メールアドレス', snapshot.email], ['事前に伝えておきたい内容', snapshot.note || '記入なし']]
      .forEach(([label, value]) => {
        const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = label; dd.textContent = value; row.append(dt, dd); summary.append(row);
      });
    notice(sendStatus, ''); send.disabled = false; edit.disabled = false;
    send.textContent = '仮予約を申し込む';
    form.hidden = true; confirmation.hidden = false;
    confirmation.focus(); confirmation.scrollIntoView({block: 'start'});
  });

  edit.addEventListener('click', () => {
    if (sending || pending) return;
    confirmation.hidden = true; form.hidden = false; loadSlots(); date.focus();
  });

  send.addEventListener('click', async () => {
    if (sending || !snapshot) return;
    sending = true; send.disabled = true; edit.disabled = true;
    pending = pending || {...snapshot};
    notice(sendStatus, '受付を確認しています。ページを閉じずにお待ちください。');
    try {
      const result = await rpc('submitReservation', pending, 45000);
      if (result && result.success === true && result.code === 'ACCEPTED' && result.reference === pending.requestId) {
        document.getElementById('receipt').textContent = '受付番号：' + result.reference;
        document.getElementById('notification-note').textContent = result.notification === 'sent'
          ? '運営への通知メールを送信しました。お客様宛ての自動返信はありません。'
          : 'カレンダーへの登録は完了しました。運営への通知メールは失敗、または送信状況を確認できません。カレンダーを確認してください。';
        pending = null; confirmation.hidden = true; accepted.hidden = false;
        accepted.focus(); accepted.scrollIntoView({block: 'start'}); return;
      }
      const known = result && result.success === false && ['CONFLICT','INVALID_INPUT','BUSY'].includes(result.code);
      if (known) {
        pending = null;
        notice(sendStatus, result.message, true);
        edit.disabled = false;
        send.disabled = result.code !== 'BUSY';
        if (result.code === 'BUSY') send.textContent = '同じ内容で再度申し込む';
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
