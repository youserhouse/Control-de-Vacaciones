// ── export-import.js ──────────────────────────────────────────
// Exportación a PDF e ICS, e importación de documentos

// ── PDF EXPORT ────────────────────────────────────────────────
function openPdfModal() {
  const empSel = document.getElementById('pdf-emp-select');
  const yearSel = document.getElementById('pdf-year-select');
  empSel.innerHTML = '<option value="all">— Todos los empleados —</option>';
  state.employees.forEach(e => empSel.add(new Option(e.name, e.id)));
  yearSel.innerHTML = '';
  for (let y = 2024; y <= 2030; y++) yearSel.add(new Option(y, y));
  yearSel.value = state.currentYear;
  openModal('pdf-modal');
}

function generatePDF() {
  const btn = document.getElementById('pdf-generate-btn');
  btn.innerHTML = 'Generando...'; btn.disabled = true;

  const empVal = document.getElementById('pdf-emp-select').value;
  const year   = parseInt(document.getElementById('pdf-year-select').value);
  const empsToShow = empVal === 'all'
    ? state.employees
    : state.employees.filter(e => e.id === parseInt(empVal));

  const { jsPDF } = window.jspdf;
  const PW = 180, PH = 320, MARGIN = 10;
  const monthW = PW - MARGIN * 2;
  const headerH = 16;
  const monthH = PH - MARGIN * 2 - headerH - 8;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [PW, PH] });

  const isLightTheme = state.theme === 'light';
  const P = isLightTheme ? {
    pageBg:[248,248,252], surface:[255,255,255], surface2:[238,238,244],
    monthBg:[250,250,255], monthHdr:[230,230,242], text:[26,26,46],
    muted:[100,100,150], accent:[200,120,0], weekend:[160,160,200],
    dayText:[40,40,60], festivo:[180,60,60], metaText:[200,200,200], border:[200,200,215],
  } : {
    pageBg:[15,15,19], surface:[26,26,34], surface2:[32,32,44],
    monthBg:[22,22,30], monthHdr:[36,36,52], text:[220,220,235],
    muted:[112,112,160], accent:[245,166,35], weekend:[80,80,120],
    dayText:[200,200,220], festivo:[255,107,107], metaText:[30,30,35], border:[50,50,70],
  };

  function setFill(arr) { doc.setFillColor(arr[0],arr[1],arr[2]); }
  function setTxt(arr)  { doc.setTextColor(arr[0],arr[1],arr[2]); }

  function drawPageHeader(doc, pageNum) {
    setFill(P.pageBg); doc.rect(0,0,PW,PH,'F');
    setFill(P.surface); doc.roundedRect(MARGIN, MARGIN, PW-MARGIN*2, 13, 2, 2, 'F');
    if (!isLightTheme) {
      doc.setDrawColor(50,50,70); doc.setLineWidth(0.3);
      doc.roundedRect(MARGIN, MARGIN, PW-MARGIN*2, 13, 2, 2, 'S');
    }
    doc.setFont('helvetica','bold'); doc.setFontSize(10);
    setTxt(P.accent);
    doc.text(`Control de Vacaciones ${year}`, MARGIN+4, MARGIN+8.5);
    doc.setFontSize(7); setTxt(P.muted);
    const empLabel = empVal === 'all' ? 'Todos los empleados' : empsToShow[0]?.name;
    doc.text(empLabel, PW-MARGIN-4, MARGIN+8.5, {align:'right'});
    if (empsToShow.length > 1) {
      let lx = MARGIN + 2;
      const ly = MARGIN + 15;
      empsToShow.forEach(emp => {
        const [r,g,b] = hexToRgb(emp.color);
        doc.setFillColor(r,g,b);
        doc.circle(lx+1.2, ly, 1.2, 'F');
        setTxt(P.text); doc.setFontSize(5.5);
        doc.text(emp.name, lx+3.5, ly+0.7);
        lx += doc.getTextWidth(emp.name) + 8;
      });
      doc.setFillColor(...P.festivo);
      doc.circle(lx+1.2, ly, 1.2, 'F');
      setTxt(P.muted); doc.setFontSize(5.5);
      doc.text('Festivo', lx+3.5, ly+0.7);
    }
  }

  function drawMonth(doc, m, mx, my, mw, mh) {
    setFill(P.monthBg); doc.roundedRect(mx, my, mw, mh, 3, 3, 'F');
    if (isLightTheme) {
      doc.setDrawColor(200,200,215); doc.setLineWidth(0.3);
      doc.roundedRect(mx, my, mw, mh, 3, 3, 'S');
    }
    const nameBarH = 14;
    setFill(P.monthHdr); doc.roundedRect(mx, my, mw, nameBarH, 3, 3, 'F');
    doc.rect(mx, my+nameBarH-4, mw, 4, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(14);
    setTxt(P.accent);
    doc.text(MONTHS[m].toUpperCase(), mx + mw/2, my+10, {align:'center'});

    const dayHeaderH = 10;
    const dayNames = ['L','M','X','J','V','S','D'];
    const gridX = mx + 2, gridW = mw - 4;
    const dayCellW = gridW / 7;
    const headerY = my + nameBarH + dayHeaderH;
    const gridH = mh - nameBarH - dayHeaderH - 4;
    const dayCellH = gridH / 6;

    dayNames.forEach((dn, i) => {
      const isWknd = i >= 5;
      doc.setFont('helvetica','bold'); doc.setFontSize(9);
      doc.setTextColor(...(isWknd ? P.weekend : P.muted));
      doc.text(dn, gridX + i*dayCellW + dayCellW/2, my + nameBarH + 7.5, {align:'center'});
    });

    doc.setDrawColor(...P.border||[200,200,215]);
    doc.setLineWidth(0.2);
    doc.line(gridX, my + nameBarH + dayHeaderH - 1, gridX + gridW, my + nameBarH + dayHeaderH - 1);

    const days = daysInMonth(year, m);
    const first = firstDayOfMonth(year, m);
    const dayCellPad = 1.2;

    for (let d = 1; d <= days; d++) {
      const pos = first + d - 1;
      const dcol = pos % 7, drow = Math.floor(pos / 7);
      const cx = gridX + dcol * dayCellW;
      const cy = headerY + drow * dayCellH;
      const cw = dayCellW - dayCellPad, ch = dayCellH - dayCellPad;
      const key = dateKey(year, m, d);
      const marks = getDayMarks(key);
      const festivo = isFestivo(key);
      const weekend = isWeekend(year, m, d);
      const vacEmps = empsToShow.filter(emp => marks[emp.id] === 'V');
      const isConflict = vacEmps.filter(emp =>
        vacEmps.some(o => o.id !== emp.id && !rolesAreCompatible(emp.role, o.role))
      ).length >= (state.conflictThreshold || 2);

      let cellTextColor = P.dayText;

      if (festivo) {
        setFill(P.festivo); doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, 'F');
        cellTextColor = [255,255,255];
      } else if (vacEmps.length === 1) {
        const [r,g,b] = hexToRgb(vacEmps[0].color);
        doc.setFillColor(r,g,b); doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, 'F');
        if (vacEmps[0].color === '#ffffff') { doc.setDrawColor(100,100,100); doc.setLineWidth(0.4); doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, 'S'); }
        if (vacEmps[0].color === '#000000') { doc.setDrawColor(150,150,150); doc.setLineWidth(0.4); doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, 'S'); }
        const tc = getTextColorForBg(vacEmps[0].color);
        cellTextColor = tc === '#fff' ? [255,255,255] : [0,0,0];
      } else if (vacEmps.length > 1) {
        const sliceW = cw / vacEmps.length;
        vacEmps.forEach((emp, i) => {
          const [r,g,b] = hexToRgb(emp.color);
          doc.setFillColor(r,g,b);
          if (i===0) doc.roundedRect(cx+i*sliceW, cy, sliceW, ch, 1.5, 1.5, 'F');
          else doc.rect(cx+i*sliceW, cy, sliceW, ch, 'F');
        });
        cellTextColor = [255,255,255];
      } else if (weekend) {
        if (!isLightTheme) { setFill(P.surface2); doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, 'F'); }
        cellTextColor = P.weekend;
      }

      if (isConflict) { doc.setDrawColor(245,166,35); doc.setLineWidth(0.7); doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, 'S'); }

      const isToday = key === todayKey();
      doc.setFont('helvetica', isToday ? 'bold' : 'normal');
      doc.setFontSize(15);
      doc.setTextColor(...cellTextColor);
      doc.text(String(d), cx + cw/2, cy + ch * 0.65, {align:'center'});

      if (isConflict) { doc.setFontSize(6); doc.setTextColor(245,166,35); doc.text('!', cx+cw-2, cy+4); }
    }

    if (empsToShow.length === 1) {
      const emp = empsToShow[0];
      const used = Object.keys(state.marks).filter(k=>
        k.startsWith(`${year}-${String(m+1).padStart(2,'0')}`) && state.marks[k][emp.id]==='V'
      ).length;
      if (used > 0) {
        const [r,g,b] = hexToRgb(emp.color);
        doc.setFontSize(7); doc.setTextColor(r,g,b);
        doc.text(`${used} día${used>1?'s':''} de vacaciones`, mx+mw-4, my+mh-2, {align:'right'});
      }
    }
  }

  const TOTAL_PAGES = 12;
  const topOffset = empsToShow.length > 1 ? 19 : 16;

  for (let page = 0; page < TOTAL_PAGES; page++) {
    if (page > 0) doc.addPage([PW, PH]);
    drawPageHeader(doc, page + 1);
    drawMonth(doc, page, MARGIN, MARGIN + topOffset, monthW, monthH);

    const isLastPage = page === TOTAL_PAGES - 1;

    if (isLastPage && empsToShow.length === 1) {
      const emp = empsToShow[0];
      const used = countVacDays(emp.id, year);
      const remaining = emp.totalDays - used;
      const [r,g,b] = hexToRgb(emp.color);
      const sx = MARGIN, sy = PH - MARGIN - 11;
      setFill(P.surface); doc.roundedRect(sx, sy, PW-MARGIN*2, 11, 2, 2, 'F');
      doc.setFillColor(r,g,b);
      doc.roundedRect(sx, sy, 3, 11, 2, 2, 'F');
      doc.rect(sx, sy, 1.5, 11, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(7.5);
      doc.setTextColor(r,g,b);
      doc.text(emp.name, sx+7, sy+7);
      setTxt(P.text); doc.setFontSize(7);
      doc.text(`${used} usados · ${remaining} restantes de ${emp.totalDays}`, sx+32, sy+7);
    }

    if (isLastPage) {
      const metaObj = empsToShow.map(emp => {
        const vacDays = Object.entries(state.marks)
          .filter(([k,v]) => k.startsWith(String(year)) && v[emp.id]==='V')
          .map(([k]) => k);
        return { empleado: emp.name, dias: vacDays };
      }).filter(e => e.dias.length > 0);
      const metaStr = 'VAC_DATA:' + JSON.stringify(metaObj);
      doc.setProperties({ title:`Control de Vacaciones ${year}`, subject:metaStr, author:'Control de Vacaciones App', keywords:metaStr, creator:'VacApp' });
      doc.setFontSize(0.1); doc.setTextColor(...P.metaText);
      doc.text(metaStr, MARGIN, PH - 0.5);
      doc.setTextColor(254, 254, 254);
      doc.text(metaStr, MARGIN, PH - 0.2);
    }

    doc.setFont('helvetica','normal'); doc.setFontSize(5.5);
    setTxt(P.muted);
    doc.text(`${new Date().toLocaleDateString('es-ES')} · ${page+1}/${TOTAL_PAGES}`, PW/2, PH-3.5, {align:'center'});
  }

  const filename = empVal === 'all'
    ? `vacaciones_todos_${year}.pdf`
    : `vacaciones_${empsToShow[0]?.name.toLowerCase()}_${year}.pdf`;
  doc.save(filename);

  btn.innerHTML = '<span style="font-size:1.1rem;">📄</span><div style="text-align:left;"><div style="font-weight:700;">Exportar PDF</div><div style="font-size:0.72rem;opacity:.8;">1 mes por página · formato móvil</div></div>';
  btn.disabled = false;
  showToast('✅ PDF descargado (12 páginas)');
}

// ── ICS EXPORT ────────────────────────────────────────────────
function generateICS() {
  const btn = document.getElementById('ics-generate-btn');
  btn.innerHTML = 'Generando...'; btn.disabled = true;

  const empVal = document.getElementById('pdf-emp-select').value;
  const year   = parseInt(document.getElementById('pdf-year-select').value);
  const empId = parseInt(empVal);
  const emp = empVal === 'all' ? null : state.employees.find(e => e.id === empId);

  const vacDays = emp
    ? Object.entries(state.marks).filter(([k,v]) => k.startsWith(String(year)) && v[emp.id]==='V').map(([k]) => k).sort()
    : [];

  const festivoDays = Object.keys(state.festivos).filter(k => k.startsWith(String(year)) && state.festivos[k]).sort();

  if (!vacDays.length && !festivoDays.length) {
    showToast('⚠️ No hay vacaciones ni festivos para exportar');
    btn.innerHTML = '<span style="font-size:1.1rem;">📅</span><div style="text-align:left;"><div style="font-weight:700;">Exportar a Google Calendar (.ics)</div><div style="font-size:0.72rem;opacity:.8;">Importa directamente en Google, Apple u Outlook</div></div>';
    btn.disabled = false;
    return;
  }

  function toICSDate(str) { return str.replace(/-/g,''); }
  function nextDay(str) { const d = new Date(str); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); }
  const uid = () => Math.random().toString(36).slice(2) + '@vacapp';
  const now = new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';

  function hexToICalColor(hex) {
    const map = {
      '#e74c3c':'Tomato','#3498db':'Peacock','#2ecc71':'Sage','#f39c12':'Banana',
      '#9b59b6':'Grape','#e91e8c':'Flamingo','#00bcd4':'Peacock','#ff6b35':'Tangerine',
      '#607d8b':'Graphite','#795548':'Graphite','#ffffff':'Lavender','#000000':'Graphite',
    };
    return map[hex.toLowerCase()] || 'Blueberry';
  }

  let events = [];
  const empColor = emp ? emp.color : '#3498db';
  const empICalColor = hexToICalColor(empColor);
  let i = 0;
  while (i < vacDays.length) {
    let start = vacDays[i], end = vacDays[i];
    while (i+1 < vacDays.length && vacDays[i+1] === nextDay(vacDays[i])) { i++; end = vacDays[i]; }
    events.push({ start:toICSDate(start), end:toICSDate(nextDay(end)), summary:`🏖️ Vacaciones ${emp.name}`, description:`Vacaciones de ${emp.name} · Control de Vacaciones app`, hex:empColor, icalColor:empICalColor, type:'vac' });
    i++;
  }

  festivoDays.forEach(key => {
    events.push({ start:toICSDate(key), end:toICSDate(nextDay(key)), summary:`🎌 Festivo`, description:`Día festivo · Control de Vacaciones app`, hex:'#e74c3c', icalColor:'Tomato', type:'festivo' });
  });

  const calName = emp ? `Vacaciones ${emp.name} ${year}` : `Festivos ${year}`;
  const lines = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Control de Vacaciones//ES',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH',`X-WR-CALNAME:${calName}`,
    'X-WR-TIMEZONE:Europe/Madrid',
    `X-APPLE-CALENDAR-COLOR:${emp ? empColor.toUpperCase() : '#E74C3C'}`,
    `COLOR:${emp ? empICalColor : 'Tomato'}`,
  ];

  events.forEach(ev => {
    lines.push('BEGIN:VEVENT',`UID:${uid()}`,`DTSTAMP:${now}`,`DTSTART;VALUE=DATE:${ev.start}`,`DTEND;VALUE=DATE:${ev.end}`,`SUMMARY:${ev.summary}`,`DESCRIPTION:${ev.description}`,`STATUS:CONFIRMED`,`TRANSP:OPAQUE`,`COLOR:${ev.icalColor}`,`X-APPLE-DEFAULT-ALARM:FALSE`,`X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC`,`CATEGORIES:${ev.type === 'festivo' ? 'Festivo' : 'Vacaciones'}`,'END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = emp ? `vacaciones_${emp.name.toLowerCase()}_${year}.ics` : `festivos_${year}.ics`;
  a.click();
  URL.revokeObjectURL(url);

  btn.innerHTML = '<span style="font-size:1.1rem;">📅</span><div style="text-align:left;"><div style="font-weight:700;">Exportar a Google Calendar (.ics)</div><div style="font-size:0.72rem;opacity:.8;">Importa directamente en Google, Apple u Outlook</div></div>';
  btn.disabled = false;
  closeModal('pdf-modal');
  showToast(`✅ .ics descargado · ${vacDays.length} vacaciones + ${festivoDays.length} festivos`);
}

// ── IMPORT ────────────────────────────────────────────────────
let importFileData = null, importFileType = null, importParsedDays = [];
// Días detectados por FILA de la tabla de asociación (índice del bucle, no el sid:
// sanitizeId puede colisionar entre dos nombres distintos y dos filas pelearían por el mismo id)
let importNameDates = {};

function openImportModal() {
  resetImport();
  const ys = document.getElementById('import-year');
  ys.innerHTML = '';
  for (let y = 2024; y <= 2030; y++) ys.add(new Option(y, y));
  ys.value = state.currentYear;
  const cs = document.getElementById('clear-emp-select');
  cs.innerHTML = '<option value="all">— Todos los empleados —</option>';
  state.employees.forEach(e => cs.add(new Option(e.name, e.id)));
  openModal('import-modal');
}

function clearImportedDays() {
  const year = parseInt(document.getElementById('import-year').value);
  const empVal = document.getElementById('clear-emp-select').value;
  const yearStr = String(year);
  let cleared = 0;

  if (empVal === 'all') {
    for (const key of Object.keys(state.marks)) {
      if (!key.startsWith(yearStr)) continue;
      for (const id of Object.keys(state.marks[key])) {
        if (state.marks[key][id] === 'V') { delete state.marks[key][id]; cleared++; }
      }
      if (!Object.keys(state.marks[key]).length) delete state.marks[key];
    }
    showToast(`🗑 ${cleared} días borrados (todos los empleados ${year})`);
  } else {
    const empId = parseInt(empVal);
    for (const key of Object.keys(state.marks)) {
      if (!key.startsWith(yearStr)) continue;
      if (state.marks[key][empId] === 'V') {
        delete state.marks[key][empId]; cleared++;
        if (!Object.keys(state.marks[key]).length) delete state.marks[key];
      }
    }
    const emp = state.employees.find(e => e.id === empId);
    showToast(`🗑 ${cleared} días borrados (${emp?.name || ''} ${year})`);
  }
  saveState(); closeModal('import-modal'); renderDashboard(); renderAnnual();
}

function resetImport() {
  importFileData = null; importFileType = null; importParsedDays = []; importNameDates = {};
  hideImportQuotaError();
  const fi = document.getElementById('import-file'); if (fi) fi.value = '';
  const dfn = document.getElementById('dz-filename'); if (dfn) dfn.textContent = '';
  const btn = document.getElementById('import-analyze-btn'); if (btn) btn.disabled = true;
  showImportStep(1);
}

function showImportStep(n) {
  [1,2,3,4].forEach(i => { const el = document.getElementById('import-step-'+i); if (el) el.style.display = i===n ? 'block' : 'none'; });
}

function handleImportFile(e) {
  const file = e.target.files[0]; if (!file) return;
  document.getElementById('dz-filename').textContent = '📎 ' + file.name;
  document.getElementById('import-analyze-btn').disabled = false;
  importFileType = file.type;
  const reader = new FileReader();
  reader.onload = ev => { importFileData = ev.target.result.split(',')[1]; };
  reader.readAsDataURL(file);
}

document.addEventListener('DOMContentLoaded', () => {
  const dz = document.getElementById('drop-zone');
  if (!dz) return;
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) { document.getElementById('import-file').files = e.dataTransfer.files; handleImportFile({target:{files:[file]}}); }
  });
});

async function analyzeDocument() {
  if (!importFileData) return;
  showImportStep(2);
  const year = parseInt(document.getElementById('import-year').value);
  try {
    document.getElementById('import-status-text').textContent = 'Leyendo documento...';
    let parsed = null;
    if (importFileType === 'application/pdf') {
      parsed = await parsePDF(importFileData, year);
    } else if (importFileType && importFileType.startsWith('image/')) {
      parsed = await parseImage(importFileData, year);
    } else {
      throw new Error('Formato no soportado. Usa PDF o imagen (JPG, PNG).');
    }
    if (!parsed || !parsed.length || parsed.every(p => !p.dias.length)) {
      throw new Error('No se encontraron fechas de vacaciones en el documento.');
    }
    importParsedDays = parsed;
    showImportPreview(parsed);
    showImportStep(3);
  } catch(err) {
    document.getElementById('import-error-text').textContent = 'No se pudo interpretar el documento.\n\nDetalle: ' + err.message;
    showImportStep(4);
  }
}

async function parsePDF(base64Data, year) {
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const raw = atob(base64Data);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  const pdf = await pdfjsLib.getDocument({ data: arr }).promise;

  try {
    const meta = await pdf.getMetadata();
    const info = meta?.info || {};
    const candidates = [info.Subject, info.Keywords, info.Title].filter(Boolean);
    for (const candidate of candidates) {
      const match = candidate.match(/VAC_DATA:(\[.*\]|\{.*\})/s);
      if (match) {
        let data = JSON.parse(match[1]);
        if (!Array.isArray(data)) data = [data];
        return data;
      }
    }
  } catch(e) {}

  let fullText = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    fullText += content.items.map(i => i.str).join('') + '\n';
  }

  const metaMatch = fullText.match(/VAC_DATA:(\[[\s\S]*?\]|\{[\s\S]*?\})/);
  if (metaMatch) {
    try {
      let data = JSON.parse(metaMatch[1]);
      if (!Array.isArray(data)) data = [data];
      return data;
    } catch(e) {}
  }

  const empNames = state.employees.map(e => e.name);
  let detectedEmp = null;
  for (const name of empNames) {
    if (fullText.toLowerCase().includes(name.toLowerCase())) { detectedEmp = name; break; }
  }
  if (!detectedEmp) detectedEmp = 'Empleado desconocido';
  const dates = extractDatesFromText(fullText, year);
  return [{ empleado: detectedEmp, dias: dates }];
}

async function parseImage(base64Data, year) {
  return [{ empleado: state.employees[0]?.name || 'Empleado', dias: [] }];
}

function extractDatesFromText(text, year) {
  const dates = new Set();
  const y = String(year);
  const iso = new RegExp(`${y}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])`, 'g');
  let m;
  while ((m = iso.exec(text)) !== null) dates.add(m[0]);
  const dmy = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g;
  while ((m = dmy.exec(text)) !== null) {
    if (m[3] === y) { const mm = m[2].padStart(2,'0'), dd = m[1].padStart(2,'0'); dates.add(`${y}-${mm}-${dd}`); }
  }
  const monthNames = { 'enero':'01','febrero':'02','marzo':'03','abril':'04','mayo':'05','junio':'06','julio':'07','agosto':'08','septiembre':'09','octubre':'10','noviembre':'11','diciembre':'12','january':'01','february':'02','march':'03','april':'04','may':'05','june':'06','july':'07','august':'08','september':'09','october':'10','november':'11','december':'12' };
  const verbal = new RegExp(`(\\d{1,2})\\s+(?:de\\s+)?(${Object.keys(monthNames).join('|')})(?:\\s+de)?\\s+(${y})`, 'gi');
  while ((m = verbal.exec(text)) !== null) {
    const mm = monthNames[m[2].toLowerCase()]; const dd = m[1].padStart(2,'0');
    if (mm) dates.add(`${y}-${mm}-${dd}`);
  }
  return [...dates].sort();
}

// ── Sanitiza cadenas antes de inyectarlas en innerHTML ────────
function sanitizeHTML(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str ?? '')));
  return div.innerHTML;
}

function showImportPreview(parsed) {
  hideImportQuotaError();
  const uniqueNames = [...new Set(parsed.map(p => p.empleado))];
  importNameDates = {};
  const matchDiv = document.getElementById('import-emp-matching');
  matchDiv.innerHTML = `<div class="import-preview" style="max-height:none;margin-bottom:10px;">
    <div class="ip-title">Asociar nombres detectados con empleados</div>
    ${uniqueNames.map((name, i) => {
      const best = findBestMatch(name); const sid = sanitizeId(name);
      // Días de ESTE nombre (varias entradas pueden repetir el mismo empleado detectado)
      importNameDates[i] = [...new Set(parsed.filter(p => p.empleado === name).flatMap(p => p.dias || []))];
      return `<div class="import-emp-match">
        <div class="emp-dot-sm" id="match-dot-${sid}" style="background:${best?.color||'#888'}"></div>
        <div style="flex:1">
          <label><strong>${sanitizeHTML(name)}</strong></label>
          <span class="quota-hint" id="quota-hint-${i}"></span>
        </div>
        <select id="match-${sid}" onchange="updateMatchDot('${sid}')">
          <option value="">— Ignorar —</option>
          ${state.employees.map(e=>`<option value="${e.id}" ${best?.id==e.id?'selected':''}>${e.name}</option>`).join('')}
        </select>
      </div>`;
    }).join('')}
  </div>`;

  const allDays = parsed.flatMap(p=>(p.dias||[]).map(d=>({date:d,emp:p.empleado}))).sort((a,b)=>a.date.localeCompare(b.date));
  const previewDiv = document.getElementById('import-preview');
  previewDiv.innerHTML = `<div class="ip-title">Días detectados (${allDays.length})</div>` +
    allDays.map(({date,emp})=>{
      const pts=date.split('-');
      const label=pts.length===3?`${parseInt(pts[2])} ${MONTHS[parseInt(pts[1])-1]} ${pts[0]}`:date;
      return `<div class="import-day-row"><span class="idr-date">${label}</span><span class="idr-emp">${sanitizeHTML(emp)}</span></div>`;
    }).join('');

  refreshImportQuotaHints();
}

function sanitizeId(str){ return str.replace(/[^a-zA-Z0-9]/g,'_'); }
function findBestMatch(name) {
  const lower = name.toLowerCase();
  return state.employees.find(e=>e.name.toLowerCase()===lower)
    || state.employees.find(e=>lower.includes(e.name.toLowerCase())||e.name.toLowerCase().includes(lower))
    || state.employees[0];
}
function updateMatchDot(sid) {
  const sel = document.getElementById('match-'+sid);
  const dot = document.getElementById('match-dot-'+sid);
  const emp = state.employees.find(e=>e.id===parseInt(sel.value));
  if (dot) dot.style.background = emp ? emp.color : '#555';
  refreshImportQuotaHints();
}

// ── CUPO EN LA IMPORTACIÓN ────────────────────────────────────
// Recorre las filas de asociación EXACTAMENTE como lo hace confirmImport,
// para que lo validado sea idéntico a lo que se escribiría.
function collectImportProposals() {
  const seen = new Set(); const out = [];
  importParsedDays.forEach(entry => {
    const sel = document.getElementById('match-' + sanitizeId(entry.empleado));
    if (!sel || !sel.value) return;                      // "— Ignorar —" o fila ausente
    const empId = parseInt(sel.value, 10);
    if (!Number.isFinite(empId)) return;
    (entry.dias || []).forEach(dateStr => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;  // descarta fechas basura
      const k = empId + '|' + dateStr;
      if (seen.has(k)) return;                            // mismo empleado/día repetido
      seen.add(k);
      out.push({ empId, date: dateStr });
    });
  });
  return out;
}

function showImportQuotaError(violations) {
  const box = document.getElementById('import-quota-error');
  if (!box) return;
  box.innerHTML = '';
  const icon = document.createElement('span');
  icon.textContent = '⚠️';
  const body = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = 'No se puede importar: se supera el cupo de vacaciones';
  body.appendChild(title);
  // Los nombres de empleado llegan del documento: siempre con textContent, nunca innerHTML
  vacQuotaLines(violations).forEach(line => {
    const row = document.createElement('div');
    row.textContent = line;
    body.appendChild(row);
  });
  const foot = document.createElement('div');
  foot.textContent = 'No se ha importado ningún día. Ajusta la asociación de nombres o el cupo de los empleados.';
  body.appendChild(foot);
  box.appendChild(icon); box.appendChild(body);
  box.style.display = 'flex';
}

function hideImportQuotaError() {
  const box = document.getElementById('import-quota-error');
  if (!box) return;
  box.innerHTML = '';
  box.style.display = 'none';
}

function refreshImportQuotaHints() {
  const proposals = collectImportProposals();
  const violations = validateVacProposals(proposals);
  const overIds = new Set(violations.map(v => v.empId));
  const uniqueNames = [...new Set(importParsedDays.map(p => p.empleado))];

  uniqueNames.forEach((name, i) => {
    const hint = document.getElementById('quota-hint-' + i);
    if (!hint) return;
    const sel = document.getElementById('match-' + sanitizeId(name));
    const empId = sel && sel.value ? parseInt(sel.value, 10) : NaN;
    if (!Number.isFinite(empId)) {
      hint.textContent = 'Se ignorará (no se importará ningún día)';
      hint.classList.remove('is-over');
      return;
    }
    // OJO: la pista usa los días de ESTE nombre pero las cifras de cupo del EMPLEADO.
    // Si dos nombres detectados apuntan al mismo empleado, ambas filas muestran el mismo
    // "cupo …" (es el del empleado) aunque cada una liste sus propios días; el exceso
    // combinado sólo lo puede afirmar el aviso agregado de abajo.
    const dates = importNameDates[i] || [];
    const byYear = {};
    dates.forEach(d => { const y = d.slice(0,4); byYear[y] = (byYear[y] || 0) + 1; });
    const years = Object.keys(byYear).sort();
    const n = dates.length;
    if (years.length === 1) {
      const y = years[0];
      const q = getVacQuota(empId, y);
      hint.textContent = `${n} ${plural(n,'día','días')} · cupo ${q.totalDays} en ${y} · ${q.used} ya ${plural(q.used,'marcado','marcados')} · ${plural(Math.max(0,q.left),'queda','quedan')} ${Math.max(0, q.left)}`;
    } else if (years.length > 1) {
      hint.textContent = `${n} ${plural(n,'día','días')} (${years.map(y=>`${y}: ${byYear[y]}`).join(' · ')}) — ver detalle abajo`;
    } else {
      hint.textContent = 'Sin días detectados';
    }
    hint.classList.toggle('is-over', overIds.has(empId));
  });

  if (violations.length) showImportQuotaError(violations); else hideImportQuotaError();
  const btn = document.getElementById('import-confirm-btn');
  if (btn) btn.disabled = violations.length > 0;
}

function confirmImport() {
  hideImportQuotaError();
  const proposals = collectImportProposals();
  const violations = validateVacProposals(proposals);
  if (violations.length) { showImportQuotaError(violations); return; }   // no se importa NADA
  proposals.forEach(({empId, date}) => {
    if (!state.marks[date]) state.marks[date] = {};
    state.marks[date][empId] = 'V';
  });
  saveState(); closeModal('import-modal');
  showToast(`✅ ${proposals.length} días importados al calendario`);
  showView('annual');
}

// ── IMPORTAR FESTIVOS DESDE EXCEL ─────────────────────────────
let festivosExcelParsed = [];

function openFestivosExcelModal() {
  festivosExcelParsed = [];
  const yearSel = document.getElementById('festivos-excel-year');
  if (yearSel) {
    yearSel.innerHTML = '';
    for (let y = 2024; y <= 2030; y++) yearSel.add(new Option(y, y));
    yearSel.value = state.currentYear;
  }
  const fi = document.getElementById('festivos-excel-file');
  if (fi) fi.value = '';
  const fn = document.getElementById('festivos-dz-filename');
  if (fn) fn.textContent = '';
  const preview = document.getElementById('festivos-excel-preview');
  if (preview) preview.style.display = 'none';
  const btn = document.getElementById('festivos-import-btn');
  if (btn) btn.disabled = true;
  const chk = document.getElementById('festivos-replace-check');
  if (chk) chk.checked = false;
  openModal('festivos-excel-modal');
}

function handleFestivosFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  document.getElementById('festivos-dz-filename').textContent = '📎 ' + file.name;

  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = new Uint8Array(ev.target.result);

      // ── cellDates: false para obtener seriales numéricos sin conversión UTC
      const workbook = XLSX.read(data, { type: 'array', cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const year = parseInt(document.getElementById('festivos-excel-year').value);

      const dateSet = new Set();
      const dates = [];

      // ── Recorrer todas las celdas del sheet detectando tipo
      for (const cellAddr of Object.keys(sheet)) {
        if (cellAddr[0] === '!') continue; // ignorar metadatos (!ref, !cols, etc.)
        const cell = sheet[cellAddr];
        let date = null;

        if (cell.t === 'n' && cell.v >= 40000 && cell.v <= 60000) {
          // ── Serial numérico de Excel → parsear con SSF en hora local
          const parsed = XLSX.SSF.parse_date_code(cell.v);
          // parsed devuelve { y, m, d, H, M, S }
          date = new Date(parsed.y, parsed.m - 1, parsed.d);

        } else if (cell.t === 's') {
          const str = String(cell.v).trim();

          // ── YYYY-MM-DD → parsear por partes para evitar interpretación UTC
          const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (ymd) {
            date = new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
          }

          // ── DD/MM/YYYY → parsear por partes
          if (!date) {
            const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (dmy) {
              date = new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
            }
          }
        }

        if (!date || isNaN(date.getTime())) continue;
        if (date.getFullYear() !== year) continue;

        // ── Construir clave YYYY-MM-DD en hora local (sin toISOString para evitar UTC)
        const key = date.getFullYear() + '-' +
          String(date.getMonth() + 1).padStart(2, '0') + '-' +
          String(date.getDate()).padStart(2, '0');

        if (!dateSet.has(key)) {
          dateSet.add(key);
          dates.push(key);
        }
      }

      // ── Ordenar ascendente
      dates.sort();

      festivosExcelParsed = dates;
      showFestivosPreview(dates);

    } catch(err) {
      showToast('❌ Error al leer el archivo: ' + err.message);
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}


function showFestivosPreview(dates) {
  const preview = document.getElementById('festivos-excel-preview');
  const list = document.getElementById('festivos-preview-list');
  const btn = document.getElementById('festivos-import-btn');

  if (!dates.length) {
    list.innerHTML = '<div style="color:#ff6666;font-size:0.8rem;">⚠️ No se encontraron fechas válidas para el año seleccionado.</div>';
    preview.style.display = 'block';
    btn.disabled = true;
    return;
  }

  list.innerHTML = dates.map(key => {
    const p = key.split('-');
    const label = `${parseInt(p[2])} ${MONTHS[parseInt(p[1])-1]} ${p[0]}`;
    const already = state.festivos[key] ? ' <span style="color:var(--muted);font-size:0.7rem;">(ya existe)</span>' : '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);font-size:0.8rem;">
      <span style="color:var(--festivo);">🎌</span>
      <span>${label}</span>${already}
    </div>`;
  }).join('');

  list.innerHTML += `<div style="margin-top:8px;font-size:0.75rem;color:var(--muted);font-weight:600;">${dates.length} festivo${dates.length>1?'s':''} detectado${dates.length>1?'s':''}</div>`;
  preview.style.display = 'block';
  btn.disabled = false;
}

function confirmFestivosImport() {
  if (!festivosExcelParsed.length) return;

  const year = parseInt(document.getElementById('festivos-excel-year').value);
  const replace = document.getElementById('festivos-replace-check').checked;

  // Si reemplazar: borrar festivos existentes de ese año
  if (replace) {
    for (const key of Object.keys(state.festivos)) {
      if (key.startsWith(String(year))) delete state.festivos[key];
    }
  }

  // Añadir los nuevos
  festivosExcelParsed.forEach(key => {
    state.festivos[key] = true;
  });

  saveState();
  closeModal('festivos-excel-modal');
  showToast(`✅ ${festivosExcelParsed.length} festivos importados para ${year}`);
  renderDashboard();
  renderAnnual();
}

// Drag & drop para festivos Excel
document.addEventListener('DOMContentLoaded', () => {
  const dz = document.getElementById('festivos-drop-zone');
  if (!dz) return;
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
      document.getElementById('festivos-excel-file').files = e.dataTransfer.files;
      handleFestivosFile({ target: { files: [file] } });
    }
  });
});
