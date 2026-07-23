// ── employees.js ──────────────────────────────────────────────
// Gestión de empleados y configuración de conflictos

// ── EMPLOYEE MODAL ────────────────────────────────────────────
let editingEmpId=null;

function getAllRoles() {
  return [...new Set([...DEFAULT_ROLES, ...(state.customRoles||[])])];
}

function buildRoleSelect(selectedRole) {
  const roles = getAllRoles();
  const sel = document.getElementById('emp-role-select');
  sel.innerHTML = roles.map(r =>
    `<option value="${r}" ${r === selectedRole ? 'selected' : ''}>${r}</option>`
  ).join('');
}

function onRoleSelectChange() {
  document.getElementById('emp-role-custom').style.display = 'none';
}

function addCustomRole() {
  const inp = document.getElementById('emp-role-custom');
  inp.style.display = inp.style.display === 'none' ? 'block' : 'none';
  if (inp.style.display === 'block') inp.focus();
}

function buildColorPicker(sel) {
  return COLORS.map(c => {
    const isWhite = c === '#ffffff';
    const isBlack = c === '#000000';
    let border = '';
    if (isWhite) border = 'border:2px solid #888;';
    if (isBlack) border = 'border:2px solid #fff;';
    return `<div class="color-opt ${c===sel?'selected':''}" style="background:${c};${border}" onclick="selectColor('${c}')"></div>`;
  }).join('');
}

function selectColor(c) {
  state.selectedColor=c;
  document.querySelectorAll('.color-opt').forEach(el=>el.classList.toggle('selected',el.style.background===c||el.style.backgroundColor===c));
}

function openAddEmployee() {
  editingEmpId=null;
  document.getElementById('emp-modal-title').textContent='Nuevo Empleado';
  document.getElementById('emp-name').value='';
  document.getElementById('emp-days').value='28';
  document.getElementById('emp-birthday').value='';
  document.getElementById('emp-email').value='';
  document.getElementById('emp-role-custom').style.display='none';
  document.getElementById('emp-role-custom').value='';
  buildRoleSelect('Encargado');
  state.selectedColor=COLORS[state.employees.length % (COLORS.length-2)];
  document.getElementById('color-picker').innerHTML=buildColorPicker(state.selectedColor);
  document.getElementById('emp-delete-btn').style.display='none';
  openModal('emp-modal');
}

function openEditEmployee(id) {
  const emp=state.employees.find(e=>e.id===id);
  if(!emp) return;
  editingEmpId=id;
  document.getElementById('emp-modal-title').textContent='Editar Empleado';
  document.getElementById('emp-name').value=emp.name;
  document.getElementById('emp-days').value=emp.totalDays;
  document.getElementById('emp-birthday').value=emp.birthday||'';
  document.getElementById('emp-email').value=emp.email||'';
  document.getElementById('emp-role-custom').style.display='none';
  document.getElementById('emp-role-custom').value='';
  buildRoleSelect(emp.role||'Encargado');
  state.selectedColor=emp.color;
  document.getElementById('color-picker').innerHTML=buildColorPicker(emp.color);
  document.getElementById('emp-delete-btn').style.display='flex';
  openModal('emp-modal');
}

function saveEmployee() {
  const name=document.getElementById('emp-name').value.trim();
  const days=parseInt(document.getElementById('emp-days').value)||28;
  if(!name){ showToast('❌ El nombre es obligatorio'); return; }

  const customInp = document.getElementById('emp-role-custom');
  let role;
  if (customInp.style.display !== 'none' && customInp.value.trim()) {
    role = customInp.value.trim();
    if (!getAllRoles().includes(role)) {
      if (!state.customRoles) state.customRoles = [];
      state.customRoles.push(role);
    }
  } else {
    role = document.getElementById('emp-role-select').value;
  }

  const birthday = document.getElementById('emp-birthday').value || '';
  const email = (document.getElementById('emp-email').value || '').trim();

  if(editingEmpId){
    const emp=state.employees.find(e=>e.id===editingEmpId);
    if(emp){ emp.name=name; emp.role=role; emp.totalDays=days; emp.color=state.selectedColor; emp.birthday=birthday; emp.email=email; }
  } else {
    state.employees.push({id:state.nextId++,name,role,color:state.selectedColor,totalDays:days,birthday,email});
  }
  saveState(); closeModal('emp-modal');
  showToast(editingEmpId?'✅ Empleado actualizado':'✅ Empleado añadido');
  renderDashboard();
}

function deleteEmployee(id) {
  if(!confirm('¿Eliminar este empleado? Se borrarán sus días marcados.')) return false;
  state.employees=state.employees.filter(e=>e.id!==id);
  for(const key of Object.keys(state.marks)){
    delete state.marks[key][id];
    if(!Object.keys(state.marks[key]).length) delete state.marks[key];
  }
  saveState(); showToast('🗑 Empleado eliminado'); renderDashboard();
  return true;
}

function deleteEmployeeFromModal() {
  if (editingEmpId == null) return;
  if (deleteEmployee(editingEmpId)) closeModal('emp-modal');
}

// ── SETTINGS MODAL ────────────────────────────────────────────
function openSettings() {
  const t = state.conflictThreshold || 2;
  const tt = state.conflictThresholdTotal || 99;
  const sel1 = document.getElementById('thresh-same-role');
  const sel2 = document.getElementById('thresh-total');
  if (sel1) sel1.value = String(t);
  if (sel2) sel2.value = String(tt);
  renderCompatPairs();
  renderCustomRolesList();
  openModal('settings-modal');
}

function saveSettings() {
  const sel1 = document.getElementById('thresh-same-role');
  const sel2 = document.getElementById('thresh-total');
  if (sel1) state.conflictThreshold = parseInt(sel1.value);
  if (sel2) state.conflictThresholdTotal = parseInt(sel2.value);

  const pairs = state.compatibleRoles || [];
  pairs.forEach((_, i) => {
    const a = document.getElementById('compat-a-'+i);
    const b = document.getElementById('compat-b-'+i);
    if (a && b) pairs[i] = [a.value, b.value];
  });
  state.compatibleRoles = pairs;
  saveState();
  closeModal('settings-modal');
  showToast('✅ Configuración guardada');
  renderDashboard();
  renderAnnual();
}

function renderCompatPairs() {
  const list = document.getElementById('compat-pairs-list');
  const pairs = state.compatibleRoles || [];
  const roles = getAllRoles();
  list.innerHTML = pairs.map((pair, i) => `
    <div style="display:flex;align-items:center;gap:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px;">
      <select class="compat-sel" id="compat-a-${i}" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:6px;font-size:0.8rem;outline:none;">
        ${roles.map(r=>`<option ${r===pair[0]?'selected':''}>${r}</option>`).join('')}
      </select>
      <span style="color:var(--muted);font-size:0.75rem;">+ </span>
      <select class="compat-sel" id="compat-b-${i}" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:6px;font-size:0.8rem;outline:none;">
        ${roles.map(r=>`<option ${r===pair[1]?'selected':''}>${r}</option>`).join('')}
      </select>
      <span style="color:var(--muted);font-size:0.75rem;flex:1;">no conflictan</span>
      <button onclick="removeCompatPair(${i})" style="background:none;border:none;color:#ff6666;cursor:pointer;font-size:1rem;">×</button>
    </div>`).join('') || '<div style="color:var(--muted);font-size:0.8rem;font-style:italic;">Sin pares compatibles definidos.</div>';
}

function addCompatPair() {
  const roles = getAllRoles();
  if (!state.compatibleRoles) state.compatibleRoles = [];
  state.compatibleRoles.push([roles[0]||'Encargado', roles[1]||'Piker']);
  renderCompatPairs();
}

function removeCompatPair(i) {
  state.compatibleRoles.splice(i, 1);
  renderCompatPairs();
}

function renderCustomRolesList() {
  const list = document.getElementById('custom-roles-list');
  const custom = state.customRoles || [];
  list.innerHTML = [...DEFAULT_ROLES.map(r=>`<span style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:0.75rem;color:var(--muted);">${r}</span>`),
    ...custom.map((r,i)=>`<span style="background:rgba(245,166,35,.1);border:1px solid rgba(245,166,35,.3);border-radius:6px;padding:4px 10px;font-size:0.75rem;display:flex;align-items:center;gap:5px;">${r}<button onclick="deleteCustomRole(${i})" style="background:none;border:none;color:#ff6666;cursor:pointer;font-size:0.9rem;padding:0;line-height:1;">×</button></span>`)
  ].join('') || '<span style="color:var(--muted);font-size:0.8rem;">Sin puestos personalizados.</span>';

  list.innerHTML += `<div style="display:flex;gap:6px;margin-top:6px;width:100%;">
    <input id="new-role-input" type="text" placeholder="Nuevo puesto..." style="flex:1;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:7px;font-size:0.8rem;outline:none;">
    <button onclick="saveNewRole()" class="btn btn-ghost" style="padding:6px 12px;font-size:0.78rem;">Añadir</button>
  </div>`;
}

function saveNewRole() {
  const inp = document.getElementById('new-role-input');
  const val = inp?.value.trim();
  if (!val) return;
  if (getAllRoles().includes(val)) { showToast('⚠️ Ya existe ese puesto'); return; }
  if (!state.customRoles) state.customRoles = [];
  state.customRoles.push(val);
  renderCustomRolesList();
  showToast('✅ Puesto añadido');
}

function deleteCustomRole(i) {
  state.customRoles.splice(i, 1);
  renderCustomRolesList();
}
