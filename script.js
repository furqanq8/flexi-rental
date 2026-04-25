const TIMEZONE = 'Asia/Kuwait';
const STORAGE_KEY = 'flexi-rental-state-v1';

const clone = (obj) => JSON.parse(JSON.stringify(obj));

const defaultState = {
  units: [],
  drivers: [],
  customers: [],
  suppliers: [],
  rentalOrders: [],
  hireOrders: [],
  timesheets: [],
  invoices: [],
  bills: [],
  rates: [],
  attachments: [],
  audit: [],
};

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unsupported file data type'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

const state = loadState();
let activeRole = 'Admin';

function kuwaitNow() {
  return new Date(
    new Date().toLocaleString('en-US', {
      timeZone: TIMEZONE,
    })
  );
}

function formatDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
  }).format(new Date(date));
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return clone(defaultState);
    return { ...clone(defaultState), ...JSON.parse(saved) };
  } catch (error) {
    console.error('Unable to load state', error);
    return clone(defaultState);
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function addAudit(action) {
  state.audit.unshift({
    id: crypto.randomUUID(),
    action,
    role: activeRole,
    timestamp: kuwaitNow().toISOString(),
  });
  state.audit = state.audit.slice(0, 500);
  persistState();
  renderAudit();
}

function setRole(role) {
  activeRole = role;
  document.body.dataset.role = role;
  addAudit(`Role changed to ${role}`);
  toggleRolePermissions();
}

function toggleRolePermissions() {
  const restrictedForOperations = ['panel-invoices', 'panel-bills', 'panel-rates'];
  const restrictedForFinance = ['panel-units', 'panel-drivers'];
  const restrictedForViewer = [
    'form-unit',
    'form-driver',
    'form-customer',
    'form-supplier',
    'form-rental-order',
    'form-hire-order',
    'form-timesheet',
    'form-invoice',
    'form-bill',
    'form-rate',
    'form-attachment',
  ];

  document.querySelectorAll('.panel').forEach((panel) => {
    panel.classList.remove('disabled');
  });

  if (activeRole === 'Operations') {
    restrictedForOperations.forEach((id) => {
      document.getElementById(id)?.classList.add('disabled');
    });
  }
  if (activeRole === 'Finance') {
    restrictedForFinance.forEach((id) => {
      document.getElementById(id)?.classList.add('disabled');
    });
  }

  document
    .querySelectorAll('.form')
    .forEach((form) => form.classList.remove('read-only'));

  if (activeRole === 'Viewer') {
    restrictedForViewer.forEach((id) => {
      document.getElementById(id)?.classList.add('read-only');
    });
  }
}

function getFormData(form) {
  const formData = new FormData(form);
  const result = {};
  for (const [key, value] of formData.entries()) {
    if (result[key]) {
      if (!Array.isArray(result[key])) {
        result[key] = [result[key]];
      }
      result[key].push(value);
    } else {
      result[key] = value;
    }
  }
  for (const element of form.querySelectorAll('select[multiple]')) {
    result[element.name] = Array.from(element.selectedOptions).map(
      (opt) => opt.value
    );
  }
  for (const element of form.querySelectorAll('input[type="file"]')) {
    result[element.name] = Array.from(element.files || []).map((file) => ({
      name: file.name,
      size: file.size,
    }));
  }
  return result;
}

function clearForm(form) {
  form.reset();
  for (const select of form.querySelectorAll('select[multiple]')) {
    Array.from(select.options).forEach((option) => (option.selected = false));
  }
}

function bindForms() {
  const formUnit = document.getElementById('form-unit');
  formUnit?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = getFormData(formUnit);
    const unit = {
      id: crypto.randomUUID(),
      ...data,
      attachments: data.attachment || [],
      status: data.status || 'Available',
      expiry: data.expiry || null,
      notes: data.notes || '',
      rate: Number(data.rate || 0),
      createdAt: kuwaitNow().toISOString(),
    };
    state.units.push(unit);
    persistState();
    addAudit(`Unit ${unit.name} created`);
    clearForm(formUnit);
    renderUnits();
    renderUnitOptions();
    evaluateAlerts();
    updateDashboard();
  });

  const formDriver = document.getElementById('form-driver');
  formDriver?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = getFormData(formDriver);
    const driver = {
      id: crypto.randomUUID(),
      ...data,
      expiry: data.expiry || null,
      createdAt: kuwaitNow().toISOString(),
    };
    state.drivers.push(driver);
    persistState();
    addAudit(`Driver ${driver.name} added`);
    clearForm(formDriver);
    renderDrivers();
    renderDriverOptions();
    evaluateAlerts();
  });

  const formCustomer = document.getElementById('form-customer');
  formCustomer?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = getFormData(formCustomer);
    const customer = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: kuwaitNow().toISOString(),
    };
    state.customers.push(customer);
    persistState();
    addAudit(`Customer ${customer.name} added`);
    clearForm(formCustomer);
    renderCustomers();
    renderCustomerOptions();
  });

  const formSupplier = document.getElementById('form-supplier');
  formSupplier?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = getFormData(formSupplier);
    const supplier = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: kuwaitNow().toISOString(),
    };
    state.suppliers.push(supplier);
    persistState();
    addAudit(`Supplier ${supplier.name} added`);
    clearForm(formSupplier);
    renderSuppliers();
    renderSupplierOptions();
  });

  const formRentalOrder = document.getElementById('form-rental-order');
  formRentalOrder?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = getFormData(formRentalOrder);
    if (!validateRentalOrder(data)) {
      alert('Unit is already booked for the selected period.');
      return;
    }
    const order = {
      id: crypto.randomUUID(),
      ...data,
      start: data.start,
      end: data.end,
      billing: Number(getBillingFromRate(data.rateId) || 0),
      tax: Number(data.tax || 0),
      extras: data.extras || [],
      status: data.status,
      total: 0,
      createdAt: kuwaitNow().toISOString(),
    };
    order.total = calculateOrderTotal(order);
    state.rentalOrders.push(order);
    if (order.status === 'Active') {
      setUnitStatus(order.unit, 'On-Rent');
    }
    persistState();
    addAudit(`Rental order ${order.number} created`);
    clearForm(formRentalOrder);
    renderRentalOrders();
    renderTimesheetOptions();
    renderRentalRateOptions();
    updateDashboard();
  });

  const formHireOrder = document.getElementById('form-hire-order');
  formHireOrder?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = getFormData(formHireOrder);
    const order = {
      id: crypto.randomUUID(),
      ...data,
      start: data.start,
      end: data.end,
      rate: Number(data.rate || 0),
      status: data.status,
      total: calculateHireTotal(data),
      createdAt: kuwaitNow().toISOString(),
    };
    state.hireOrders.push(order);
    persistState();
    addAudit(`Hire order ${order.number} created`);
    clearForm(formHireOrder);
    renderHireOrders();
    renderBillOptions();
    updateDashboard();
  });

  const formTimesheet = document.getElementById('form-timesheet');
  formTimesheet?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = getFormData(formTimesheet);
    const order = state.rentalOrders.find((o) => o.id === data.order);
    const rateInfo = findRateForOrder(order, data.type);
    const amount = calculateTimesheetAmount(order, data, rateInfo);
    const timesheet = {
      id: crypto.randomUUID(),
      ...data,
      extras: data.extras || [],
      quantity: Number(data.quantity || 0),
      amount,
      createdAt: kuwaitNow().toISOString(),
    };
    state.timesheets.push(timesheet);
    persistState();
    addAudit(`Timesheet logged for order ${order?.number || data.order}`);
    clearForm(formTimesheet);
    renderTimesheets();
    updateDashboard();
  });

  const formInvoice = document.getElementById('form-invoice');
  formInvoice?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = getFormData(formInvoice);
    const invoice = {
      id: crypto.randomUUID(),
      ...data,
      amount: Number(data.amount || 0),
      tax: Number(data.tax || 0),
      balance: calculateInvoiceBalance(data),
      createdAt: kuwaitNow().toISOString(),
    };
    state.invoices.push(invoice);
    persistState();
    addAudit(`Invoice ${invoice.number} created`);
    clearForm(formInvoice);
    renderInvoices();
    renderStatementButton();
    updateDashboard();
  });

  const formBill = document.getElementById('form-bill');
  formBill?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = getFormData(formBill);
    const bill = {
      id: crypto.randomUUID(),
      ...data,
      amount: Number(data.amount || 0),
      balance: calculateBillBalance(data),
      createdAt: kuwaitNow().toISOString(),
    };
    state.bills.push(bill);
    persistState();
    addAudit(`Bill ${bill.number} created`);
    clearForm(formBill);
    renderBills();
    updateDashboard();
  });

  const formRate = document.getElementById('form-rate');
  formRate?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = getFormData(formRate);
    const rate = {
      id: crypto.randomUUID(),
      ...data,
      rate: Number(data.rate || 0),
      standby: Number(data.standby || 0),
      overtime: Number(data.overtime || 0),
      mobilization: Number(data.mobilization || 0),
      demobilization: Number(data.demobilization || 0),
      createdAt: kuwaitNow().toISOString(),
    };
    state.rates.push(rate);
    persistState();
    addAudit(`Rate for ${rate.category} (${rate.type}) added`);
    clearForm(formRate);
    renderRates();
  });

  const formAttachment = document.getElementById('form-attachment');
  formAttachment?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = getFormData(formAttachment);
    const fileInput = formAttachment.querySelector('input[name="file"]');
    const selectedFile = fileInput?.files?.[0];
    let fileMeta = null;

    if (selectedFile) {
      try {
        const dataUrl = await readFileAsDataURL(selectedFile);
        fileMeta = {
          name: selectedFile.name,
          size: selectedFile.size,
          type: selectedFile.type || 'application/octet-stream',
          dataUrl,
        };
      } catch (error) {
        console.error('Failed to read attachment', error);
        alert('Unable to load the attachment preview. Please try again.');
      }
    }

    const attachment = {
      id: crypto.randomUUID(),
      ...data,
      file: fileMeta?.name || data.file?.[0]?.name || 'Document',
      fileMeta,
      size: fileMeta?.size || data.file?.[0]?.size || 0,
      createdAt: kuwaitNow().toISOString(),
    };
    state.attachments.push(attachment);
    persistState();
    addAudit(`Attachment added for ${attachment.reference}`);
    clearForm(formAttachment);
    renderAttachments();
    evaluateAlerts();
  });
}

function validateRentalOrder(order) {
  const start = new Date(order.start);
  const end = new Date(order.end);
  return !state.rentalOrders.some((existing) => {
    if (existing.unit !== order.unit) return false;
    if (existing.status === 'Closed') return false;
    const existingStart = new Date(existing.start);
    const existingEnd = new Date(existing.end);
    const overlap = start <= existingEnd && end >= existingStart;
    return overlap;
  });
}

function calculateOrderTotal(order) {
  const baseRate = Number(order.billing || 0);
  const extrasRate = (order.extras || []).length * (baseRate * 0.1);
  const taxAmount = (baseRate + extrasRate) * (Number(order.tax || 0) / 100);
  return Number((baseRate + extrasRate + taxAmount).toFixed(3));
}

function calculateHireTotal(order) {
  const rate = Number(order.rate || 0);
  return Number(rate.toFixed(3));
}

function findRateForOrder(order, timesheetType) {
  if (!order) return null;
  return state.rates.find(
    (rate) => rate.category === findUnit(order.unit)?.category && rate.type === timesheetType
  );
}

function getBillingFromRate(rateId) {
  const rate = state.rates.find((item) => item.id === rateId);
  return Number(rate?.rate || 0);
}

function calculateTimesheetAmount(order, data, rateInfo) {
  const baseRate = rateInfo?.rate || Number(order?.billing || 0);
  const quantity = Number(data.quantity || 0);
  const extrasMultiplier = (data.extras || []).length * 0.1;
  return Number((baseRate * quantity * (1 + extrasMultiplier)).toFixed(3));
}

function calculateInvoiceBalance(data) {
  const amount = Number(data.amount || 0);
  const tax = (amount * Number(data.tax || 0)) / 100;
  if (data.status === 'Paid') return 0;
  return Number((amount + tax).toFixed(3));
}

function calculateBillBalance(data) {
  const amount = Number(data.amount || 0);
  if (data.status === 'Paid') return 0;
  return Number(amount.toFixed(3));
}

function setUnitStatus(unitId, status) {
  const unit = findUnit(unitId);
  if (unit) {
    unit.status = status;
    persistState();
    renderUnits();
  }
}

function findUnit(unitId) {
  return state.units.find((unit) => unit.id === unitId);
}

function renderTableRows(tableId, rows) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = '';
  rows.forEach((row) => tbody.appendChild(row));
}

function createActionsCell(entity, handlers = {}) {
  const template = document.getElementById('row-actions-template');
  const content = template.content.cloneNode(true);
  const container = content.querySelector('.row-actions');
  container.querySelector('[data-action="edit"]').addEventListener('click', () => handlers.onEdit?.(entity));
  container.querySelector('[data-action="delete"]').addEventListener('click', () => handlers.onDelete?.(entity));
  container.querySelector('[data-action="pdf"]').addEventListener('click', () => handlers.onPDF?.(entity));
  return container;
}

function createStatusSelect(currentStatus, onChange) {
  const template = document.getElementById('row-status-template');
  const content = template.content.cloneNode(true);
  const select = content.querySelector('[data-status]');
  Array.from(select.options).forEach((option) => {
    if (!['Draft', 'Active', 'Closed', 'Issued', 'Paid'].includes(option.value)) {
      option.remove();
    }
  });
  select.value = currentStatus;
  select.addEventListener('change', (event) => onChange(event.target.value));
  return select;
}

function renderUnits() {
  const rows = state.units.map((unit) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${unit.name}</td>
      <td>${unit.category}</td>
      <td>${unit.serial}</td>
      <td>${unit.status}</td>
      <td>${unit.rate?.toFixed?.(3) || '0.000'}</td>
      <td>${unit.expiry ? formatDate(unit.expiry) : ''}</td>
      <td></td>
    `;
    const actions = createActionsCell(unit, {
      onEdit: () => populateUnitForm(unit),
      onDelete: () => deleteEntity(state.units, unit.id, `Unit ${unit.name} removed`),
      onPDF: () => generatePDF('Unit', unit),
    });
    tr.lastElementChild.appendChild(actions);
    return tr;
  });
  renderTableRows('table-units', rows);
}

function populateUnitForm(unit) {
  const form = document.getElementById('form-unit');
  if (!form) return;
  form.name.value = unit.name;
  form.category.value = unit.category;
  form.serial.value = unit.serial;
  form.status.value = unit.status;
  form.rate.value = unit.rate;
  form.notes.value = unit.notes;
  form.expiry.value = unit.expiry ? unit.expiry.split('T')[0] : '';
  deleteEntity(state.units, unit.id, `Unit ${unit.name} ready for update`, false);
}

function renderDrivers() {
  const rows = state.drivers.map((driver) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${driver.name}</td>
      <td>${driver.license}</td>
      <td>${formatDate(driver.expiry)}</td>
      <td>${driver.phone || ''}</td>
      <td></td>
    `;
    const actions = createActionsCell(driver, {
      onEdit: () => populateDriverForm(driver),
      onDelete: () => deleteEntity(state.drivers, driver.id, `Driver ${driver.name} removed`),
      onPDF: () => generatePDF('Driver', driver),
    });
    tr.lastElementChild.appendChild(actions);
    return tr;
  });
  renderTableRows('table-drivers', rows);
}

function populateDriverForm(driver) {
  const form = document.getElementById('form-driver');
  if (!form) return;
  form.name.value = driver.name;
  form.license.value = driver.license;
  form.expiry.value = driver.expiry ? driver.expiry.split('T')[0] : '';
  form.phone.value = driver.phone || '';
  form.notes.value = driver.notes || '';
  deleteEntity(state.drivers, driver.id, `Driver ${driver.name} ready for update`, false);
}

function renderCustomers() {
  const rows = state.customers.map((customer) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${customer.name}</td>
      <td>${customer.contact || ''}</td>
      <td>${customer.email || ''}</td>
      <td>${customer.phone || ''}</td>
      <td>${customer.currency || 'KWD'}</td>
      <td></td>
    `;
    const actions = createActionsCell(customer, {
      onEdit: () => populateCustomerForm(customer),
      onDelete: () => deleteEntity(state.customers, customer.id, `Customer ${customer.name} removed`),
      onPDF: () => generatePDF('Customer', customer),
    });
    tr.lastElementChild.appendChild(actions);
    return tr;
  });
  renderTableRows('table-customers', rows);
}

function populateCustomerForm(customer) {
  const form = document.getElementById('form-customer');
  if (!form) return;
  form.name.value = customer.name;
  form.contact.value = customer.contact || '';
  form.email.value = customer.email || '';
  form.phone.value = customer.phone || '';
  form.currency.value = customer.currency || 'KWD';
  deleteEntity(state.customers, customer.id, `Customer ${customer.name} ready for update`, false);
}

function renderSuppliers() {
  const rows = state.suppliers.map((supplier) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${supplier.name}</td>
      <td>${supplier.contact || ''}</td>
      <td>${supplier.email || ''}</td>
      <td>${supplier.phone || ''}</td>
      <td>${supplier.currency || 'KWD'}</td>
      <td></td>
    `;
    const actions = createActionsCell(supplier, {
      onEdit: () => populateSupplierForm(supplier),
      onDelete: () => deleteEntity(state.suppliers, supplier.id, `Supplier ${supplier.name} removed`),
      onPDF: () => generatePDF('Supplier', supplier),
    });
    tr.lastElementChild.appendChild(actions);
    return tr;
  });
  renderTableRows('table-suppliers', rows);
}

function populateSupplierForm(supplier) {
  const form = document.getElementById('form-supplier');
  if (!form) return;
  form.name.value = supplier.name;
  form.contact.value = supplier.contact || '';
  form.email.value = supplier.email || '';
  form.phone.value = supplier.phone || '';
  form.currency.value = supplier.currency || 'KWD';
  deleteEntity(state.suppliers, supplier.id, `Supplier ${supplier.name} ready for update`, false);
}

function renderRentalOrders() {
  const rows = state.rentalOrders.map((order) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${order.number}</td>
      <td>${findCustomer(order.customer)?.name || ''}</td>
      <td>${findUnit(order.unit)?.name || ''}</td>
      <td>${formatDate(order.start)}</td>
      <td>${formatDate(order.end)}</td>
      <td></td>
      <td>${order.total?.toFixed?.(3) || '0.000'} ${order.currency}</td>
      <td></td>
    `;
    const statusCell = tr.children[5];
    statusCell.appendChild(
      createStatusSelect(order.status, (status) => updateRentalOrderStatus(order.id, status))
    );
    const actions = createActionsCell(order, {
      onEdit: () => populateRentalOrderForm(order),
      onDelete: () => deleteEntity(state.rentalOrders, order.id, `Rental order ${order.number} removed`),
      onPDF: () => generatePDF('Rental Order', order),
    });
    tr.lastElementChild.appendChild(actions);
    return tr;
  });
  renderTableRows('table-rental-orders', rows);
  renderTimesheetOptions();
}

function updateRentalOrderStatus(orderId, status) {
  const order = state.rentalOrders.find((o) => o.id === orderId);
  if (!order) return;
  order.status = status;
  if (status === 'Active') {
    setUnitStatus(order.unit, 'On-Rent');
  } else if (status === 'Closed') {
    setUnitStatus(order.unit, 'Available');
  }
  persistState();
  addAudit(`Rental order ${order.number} status ${status}`);
  updateDashboard();
}

function populateRentalOrderForm(order) {
  const form = document.getElementById('form-rental-order');
  if (!form) return;
  form.number.value = order.number;
  form.customer.value = order.customer;
  form.unit.value = order.unit;
  form.start.value = order.start;
  form.end.value = order.end;
  form.rateType.value = order.rateType;
  form.billing.value = order.billing;
  form.status.value = order.status;
  form.tax.value = order.tax;
  form.currency.value = order.currency;
  form.notes.value = order.notes || '';
  Array.from(form.extras.options).forEach((opt) => {
    opt.selected = order.extras?.includes(opt.value);
  });
  deleteEntity(state.rentalOrders, order.id, `Rental order ${order.number} ready for update`, false);
}

function renderHireOrders() {
  const rows = state.hireOrders.map((order) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${order.number}</td>
      <td>${findSupplier(order.supplier)?.name || ''}</td>
      <td>${findUnit(order.unit)?.name || ''}</td>
      <td>${formatDate(order.start)}</td>
      <td>${formatDate(order.end)}</td>
      <td></td>
      <td>${order.total?.toFixed?.(3) || '0.000'} ${order.currency}</td>
      <td></td>
    `;
    const statusCell = tr.children[5];
    statusCell.appendChild(
      createStatusSelect(order.status, (status) => updateHireOrderStatus(order.id, status))
    );
    const actions = createActionsCell(order, {
      onEdit: () => populateHireOrderForm(order),
      onDelete: () => deleteEntity(state.hireOrders, order.id, `Hire order ${order.number} removed`),
      onPDF: () => generatePDF('Hire Order', order),
    });
    tr.lastElementChild.appendChild(actions);
    return tr;
  });
  renderTableRows('table-hire-orders', rows);
  renderBillOptions();
}

function updateHireOrderStatus(orderId, status) {
  const order = state.hireOrders.find((o) => o.id === orderId);
  if (!order) return;
  order.status = status;
  persistState();
  addAudit(`Hire order ${order.number} status ${status}`);
  updateDashboard();
}

function populateHireOrderForm(order) {
  const form = document.getElementById('form-hire-order');
  if (!form) return;
  form.number.value = order.number;
  form.supplier.value = order.supplier;
  form.unit.value = order.unit;
  form.start.value = order.start;
  form.end.value = order.end;
  form.rateType.value = order.rateType;
  form.rate.value = order.rate;
  form.status.value = order.status;
  form.currency.value = order.currency;
  form.notes.value = order.notes || '';
  deleteEntity(state.hireOrders, order.id, `Hire order ${order.number} ready for update`, false);
}

function renderTimesheets() {
  const rows = state.timesheets.map((sheet) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(sheet.date)}</td>
      <td>${findRentalOrder(sheet.order)?.number || ''}</td>
      <td>${findDriver(sheet.driver)?.name || ''}</td>
      <td>${sheet.type}</td>
      <td>${sheet.quantity}</td>
      <td>${(sheet.extras || []).join(', ')}</td>
      <td>${sheet.amount?.toFixed?.(3) || '0.000'} KWD</td>
      <td></td>
    `;
    const actions = createActionsCell(sheet, {
      onEdit: () => populateTimesheetForm(sheet),
      onDelete: () => deleteEntity(state.timesheets, sheet.id, 'Timesheet removed'),
      onPDF: () => generatePDF('Timesheet', sheet),
    });
    tr.lastElementChild.appendChild(actions);
    return tr;
  });
  renderTableRows('table-timesheets', rows);
}

function populateTimesheetForm(sheet) {
  const form = document.getElementById('form-timesheet');
  if (!form) return;
  form.order.value = sheet.order;
  form.driver.value = sheet.driver;
  form.date.value = sheet.date;
  form.type.value = sheet.type;
  form.quantity.value = sheet.quantity;
  Array.from(form.extras.options).forEach((opt) => {
    opt.selected = sheet.extras?.includes(opt.value);
  });
  form.notes.value = sheet.notes || '';
  deleteEntity(state.timesheets, sheet.id, 'Timesheet ready for update', false);
}

function renderInvoices() {
  const rows = state.invoices.map((invoice) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${invoice.number}</td>
      <td>${findCustomer(invoice.customer)?.name || ''}</td>
      <td>${formatDate(invoice.date)}</td>
      <td>${formatDate(invoice.due)}</td>
      <td></td>
      <td>${invoice.balance?.toFixed?.(3) || '0.000'} ${invoice.currency}</td>
      <td></td>
    `;
    const statusCell = tr.children[4];
    statusCell.appendChild(
      createStatusSelect(invoice.status, (status) => updateInvoiceStatus(invoice.id, status))
    );
    const actions = createActionsCell(invoice, {
      onEdit: () => populateInvoiceForm(invoice),
      onDelete: () => deleteEntity(state.invoices, invoice.id, `Invoice ${invoice.number} removed`),
      onPDF: () => generatePDF('Invoice', invoice),
    });
    tr.lastElementChild.appendChild(actions);
    return tr;
  });
  renderTableRows('table-invoices', rows);
}

function populateInvoiceForm(invoice) {
  const form = document.getElementById('form-invoice');
  if (!form) return;
  form.number.value = invoice.number;
  form.customer.value = invoice.customer;
  form.order.value = invoice.order || '';
  form.date.value = invoice.date;
  form.due.value = invoice.due;
  form.currency.value = invoice.currency;
  form.amount.value = invoice.amount;
  form.tax.value = invoice.tax;
  form.status.value = invoice.status;
  form.receipt.value = invoice.receipt || '';
  deleteEntity(state.invoices, invoice.id, `Invoice ${invoice.number} ready for update`, false);
}

function updateInvoiceStatus(invoiceId, status) {
  const invoice = state.invoices.find((inv) => inv.id === invoiceId);
  if (!invoice) return;
  invoice.status = status;
  invoice.balance = calculateInvoiceBalance(invoice);
  if (status === 'Paid') {
    invoice.receipt = kuwaitNow().toISOString();
  }
  persistState();
  addAudit(`Invoice ${invoice.number} status ${status}`);
  updateDashboard();
  renderInvoices();
}

function renderBills() {
  const rows = state.bills.map((bill) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${bill.number}</td>
      <td>${findSupplier(bill.supplier)?.name || ''}</td>
      <td>${formatDate(bill.date)}</td>
      <td>${formatDate(bill.due)}</td>
      <td></td>
      <td>${bill.balance?.toFixed?.(3) || '0.000'} ${bill.currency}</td>
      <td></td>
    `;
    const statusCell = tr.children[4];
    statusCell.appendChild(
      createStatusSelect(bill.status, (status) => updateBillStatus(bill.id, status))
    );
    const actions = createActionsCell(bill, {
      onEdit: () => populateBillForm(bill),
      onDelete: () => deleteEntity(state.bills, bill.id, `Bill ${bill.number} removed`),
      onPDF: () => generatePDF('Bill', bill),
    });
    tr.lastElementChild.appendChild(actions);
    return tr;
  });
  renderTableRows('table-bills', rows);
}

function populateBillForm(bill) {
  const form = document.getElementById('form-bill');
  if (!form) return;
  form.number.value = bill.number;
  form.supplier.value = bill.supplier;
  form.order.value = bill.order || '';
  form.date.value = bill.date;
  form.due.value = bill.due;
  form.currency.value = bill.currency;
  form.amount.value = bill.amount;
  form.status.value = bill.status;
  form.payment.value = bill.payment || '';
  deleteEntity(state.bills, bill.id, `Bill ${bill.number} ready for update`, false);
}

function updateBillStatus(billId, status) {
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return;
  bill.status = status;
  bill.balance = calculateBillBalance(bill);
  if (status === 'Paid') {
    bill.payment = kuwaitNow().toISOString();
  }
  persistState();
  addAudit(`Bill ${bill.number} status ${status}`);
  updateDashboard();
  renderBills();
}

function renderRates() {
  const rows = state.rates.map((rate) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${rate.category}</td>
      <td>${rate.type}</td>
      <td>${rate.rate?.toFixed?.(3) || '0.000'}</td>
      <td>${rate.standby?.toFixed?.(3) || '0.000'}</td>
      <td>${rate.overtime?.toFixed?.(3) || '0.000'}</td>
      <td>${rate.mobilization?.toFixed?.(3) || '0.000'}</td>
      <td>${rate.demobilization?.toFixed?.(3) || '0.000'}</td>
      <td></td>
    `;
    const actions = createActionsCell(rate, {
      onEdit: () => populateRateForm(rate),
      onDelete: () => deleteEntity(state.rates, rate.id, 'Rate removed'),
      onPDF: () => generatePDF('Rate', rate),
    });
    tr.lastElementChild.appendChild(actions);
    return tr;
  });
  renderTableRows('table-rates', rows);
  renderRentalRateOptions();
}

function populateRateForm(rate) {
  const form = document.getElementById('form-rate');
  if (!form) return;
  form.category.value = rate.category;
  form.type.value = rate.type;
  form.rate.value = rate.rate;
  form.standby.value = rate.standby;
  form.overtime.value = rate.overtime;
  form.mobilization.value = rate.mobilization;
  form.demobilization.value = rate.demobilization;
  deleteEntity(state.rates, rate.id, 'Rate ready for update', false);
}

function renderAttachments() {
  const rows = state.attachments.map((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.entity}</td>
      <td>${item.reference}</td>
      <td>${item.fileMeta?.name || item.file || 'Document'}</td>
      <td>${formatDate(item.expiry)}</td>
      <td>${item.description || ''}</td>
      <td></td>
    `;
    const actions = createActionsCell(item, {
      onEdit: () => populateAttachmentForm(item),
      onDelete: () => deleteEntity(state.attachments, item.id, 'Attachment removed'),
      onPDF: () => previewAttachment(item),
    });
    tr.lastElementChild.appendChild(actions);
    return tr;
  });
  renderTableRows('table-attachments', rows);
}

function populateAttachmentForm(item) {
  const form = document.getElementById('form-attachment');
  if (!form) return;
  form.entity.value = item.entity;
  form.reference.value = item.reference;
  form.description.value = item.description || '';
  form.expiry.value = item.expiry ? item.expiry.split('T')[0] : '';
  deleteEntity(state.attachments, item.id, 'Attachment ready for update', false);
}

function previewAttachment(attachment) {
  const fileMeta = attachment.fileMeta;
  const dataUrl = fileMeta?.dataUrl || attachment.fileDataUrl;
  if (!dataUrl) {
    alert('No preview is available for this attachment. Please re-upload the file to enable preview.');
    return;
  }

  const type = fileMeta?.type || '';
  const name = fileMeta?.name || attachment.file || 'Attachment';
  const previewWindow = window.open('', '_blank');
  if (!previewWindow) {
    alert('Please allow pop-ups to preview attachments.');
    return;
  }

  const safeTitle = name.replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char]));
  const safeUrl = dataUrl;
  const isImage = type.startsWith('image/');
  const isPDF = type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');

  let bodyContent = '';
  if (isImage) {
    bodyContent = `<img src="${safeUrl}" alt="${safeTitle}" style="max-width:100%;height:auto;display:block;margin:0 auto;" />`;
  } else if (isPDF) {
    bodyContent = `<embed src="${safeUrl}" type="application/pdf" style="width:100%;height:100vh;" />`;
  } else {
    bodyContent = `
      <p style="font-family:Inter, sans-serif;color:#1f2937;">Preview is not available for this file type.</p>
      <p style="font-family:Inter, sans-serif;"><a href="${safeUrl}" download="${safeTitle}">Download ${safeTitle}</a></p>
    `;
  }

  previewWindow.document.write(`
    <html>
      <head>
        <title>${safeTitle}</title>
        <meta charset="utf-8" />
        <style>
          body { margin: 0; background: #111827; color: #f9fafb; font-family: Inter, sans-serif; }
          .wrapper { padding: 1.5rem; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <h1 style="margin-top:0;">${safeTitle}</h1>
          ${bodyContent}
        </div>
      </body>
    </html>
  `);
  previewWindow.document.close();
  previewWindow.focus();
}

function renderAudit() {
  const rows = state.audit.map((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(item.timestamp)} ${new Date(item.timestamp).toLocaleTimeString('en-GB', {
      timeZone: TIMEZONE,
    })}</td>
      <td>${item.role}</td>
      <td>${item.action}</td>
    `;
    return tr;
  });
  renderTableRows('table-audit', rows);
}

function renderAlerts(alerts) {
  const container = document.getElementById('alerts-container');
  if (!container) return;
  container.innerHTML = '';
  if (!alerts.length) {
    container.innerHTML = '<p class="muted">No alerts at this time.</p>';
    return;
  }
  const template = document.getElementById('alert-template');
  alerts.forEach((alert) => {
    const content = template.content.cloneNode(true);
    content.querySelector('.alert-title').textContent = alert.title;
    content.querySelector('.alert-date').textContent = alert.date;
    container.appendChild(content);
  });
}

function findCustomer(id) {
  return state.customers.find((customer) => customer.id === id);
}

function findSupplier(id) {
  return state.suppliers.find((supplier) => supplier.id === id);
}

function findDriver(id) {
  return state.drivers.find((driver) => driver.id === id);
}

function findRentalOrder(id) {
  return state.rentalOrders.find((order) => order.id === id);
}

function deleteEntity(collection, id, message, log = true) {
  const index = collection.findIndex((item) => item.id === id);
  if (index >= 0) {
    const [removed] = collection.splice(index, 1);
    persistState();
    if (log) addAudit(message);
    renderAll();
    updateDashboard();
    evaluateAlerts();
    return removed;
  }
  return null;
}

function renderAll() {
  renderUnits();
  renderDrivers();
  renderCustomers();
  renderSuppliers();
  renderRentalOrders();
  renderHireOrders();
  renderTimesheets();
  renderInvoices();
  renderBills();
  renderRates();
  renderAttachments();
  renderAudit();
  renderStatementButton();
  updateDashboard();
  evaluateAlerts();
}

function renderUnitOptions() {
  const unitSelects = document.querySelectorAll('select[name="unit"]');
  unitSelects.forEach((select) => {
    const current = select.value;
    select.innerHTML =
      '<option value="" disabled selected>Select Unit</option>' +
      state.units
        .map((unit) => `<option value="${unit.id}">${unit.name} (${unit.status})</option>`)
        .join('');
    select.value = current;
  });
  renderRentalRateOptions();
}

function renderCustomerOptions() {
  const customerSelects = document.querySelectorAll('select[name="customer"]');
  customerSelects.forEach((select) => {
    const current = select.value;
    select.innerHTML =
      '<option value="" disabled selected>Select Customer</option>' +
      state.customers.map((customer) => `<option value="${customer.id}">${customer.name}</option>`).join('');
    select.value = current;
  });
}

function renderSupplierOptions() {
  const supplierSelects = document.querySelectorAll('select[name="supplier"]');
  supplierSelects.forEach((select) => {
    const current = select.value;
    select.innerHTML =
      '<option value="" disabled selected>Select Supplier</option>' +
      state.suppliers.map((supplier) => `<option value="${supplier.id}">${supplier.name}</option>`).join('');
    select.value = current;
  });
}

function renderDriverOptions() {
  const driverSelect = document.querySelector('select[name="driver"]');
  if (!driverSelect) return;
  const current = driverSelect.value;
  driverSelect.innerHTML =
    '<option value="">Select Driver</option>' +
    state.drivers.map((driver) => `<option value="${driver.id}">${driver.name}</option>`).join('');
  driverSelect.value = current;
}

function renderTimesheetOptions() {
  const orderSelects = document.querySelectorAll('select[name="order"]');
  orderSelects.forEach((select) => {
    const current = select.value;
    select.innerHTML =
      '<option value="">Select Order</option>' +
      state.rentalOrders
        .map((order) => `<option value="${order.id}">${order.number} (${order.status})</option>`)
        .join('');
    select.value = current;
  });
}

function renderBillOptions() {
  const orderSelect = document.querySelector('#form-bill select[name="order"]');
  if (!orderSelect) return;
  const current = orderSelect.value;
  orderSelect.innerHTML =
    '<option value="">Select Hire Order</option>' +
    state.hireOrders
      .map((order) => `<option value="${order.id}">${order.number} (${order.status})</option>`)
      .join('');
  orderSelect.value = current;
}

function renderStatementButton() {
  const button = document.getElementById('btn-generate-statement');
  button.disabled = state.invoices.length === 0;
}

function updateDashboard() {
  const totalUnits = state.units.length;
  const onRent = state.units.filter((unit) => unit.status === 'On-Rent').length;
  const openOrders = state.rentalOrders.filter((order) => order.status !== 'Closed').length;
  const ar = state.invoices
    .filter((invoice) => invoice.status !== 'Paid')
    .reduce((sum, invoice) => sum + invoice.balance, 0);
  const ap = state.bills.filter((bill) => bill.status !== 'Paid').reduce((sum, bill) => sum + bill.balance, 0);

  document.getElementById('kpi-total-units').textContent = totalUnits;
  document.getElementById('kpi-on-rent').textContent = onRent;
  document.getElementById('kpi-utilization').textContent = totalUnits
    ? `${Math.round((onRent / totalUnits) * 100)}%`
    : '0%';
  document.getElementById('kpi-open-rentals').textContent = openOrders;
  document.getElementById('kpi-ar').textContent = `${ar.toFixed(3)} KWD`;
  document.getElementById('kpi-ap').textContent = `${ap.toFixed(3)} KWD`;

  renderAging('table-ar-aging', state.invoices);
  renderAging('table-ap-aging', state.bills);
  renderUtilizationByCategory();
}

function renderAging(tableId, documents) {
  const today = kuwaitNow();
  const buckets = {
    current: 0,
    '1-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
  };
  documents.forEach((doc) => {
    if (doc.status === 'Paid') return;
    const due = new Date(doc.due || doc.date);
    const diffDays = Math.floor((today - due) / (1000 * 60 * 60 * 24));
    const balance = doc.balance || doc.amount || 0;
    if (diffDays <= 0) buckets.current += balance;
    else if (diffDays <= 30) buckets['1-30'] += balance;
    else if (diffDays <= 60) buckets['31-60'] += balance;
    else if (diffDays <= 90) buckets['61-90'] += balance;
    else buckets['90+'] += balance;
  });

  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = '';
  Object.entries(buckets).forEach(([bucket, amount]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${bucket}</td><td>${amount.toFixed(3)}</td>`;
    tbody.appendChild(tr);
  });
}

function renderUtilizationByCategory() {
  const categories = {};
  state.units.forEach((unit) => {
    if (!categories[unit.category]) {
      categories[unit.category] = { total: 0, onRent: 0 };
    }
    categories[unit.category].total += 1;
    if (unit.status === 'On-Rent') categories[unit.category].onRent += 1;
  });
  const tbody = document.querySelector('#table-utilization tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  Object.entries(categories).forEach(([category, data]) => {
    const tr = document.createElement('tr');
    const utilization = data.total ? `${Math.round((data.onRent / data.total) * 100)}%` : '0%';
    tr.innerHTML = `
      <td>${category}</td>
      <td>${data.total}</td>
      <td>${data.onRent}</td>
      <td>${utilization}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderRentalRateOptions() {
  const form = document.getElementById('form-rental-order');
  if (!form) return;
  const unitId = form.querySelector('select[name="unit"]')?.value;
  const rateType = form.querySelector('select[name="rateType"]')?.value;
  const rateSelect = form.querySelector('select[name="rateId"]');
  if (!rateSelect) return;
  const current = rateSelect.value;
  const unit = findUnit(unitId);
  const filteredRates = state.rates.filter(
    (rate) => rate.category === unit?.category && rate.type === rateType
  );
  rateSelect.innerHTML =
    '<option value="">Select Rate</option>' +
    filteredRates
      .map(
        (rate) =>
          `<option value="${rate.id}">${rate.category} - ${rate.type} (${Number(rate.rate).toFixed(3)} KWD)</option>`
      )
      .join('');
  rateSelect.value = filteredRates.some((rate) => rate.id === current) ? current : '';
  syncRentalBillingBasis();
}

function syncRentalBillingBasis() {
  const form = document.getElementById('form-rental-order');
  if (!form) return;
  const rateId = form.querySelector('select[name="rateId"]')?.value;
  const billingInput = form.querySelector('input[name="billing"]');
  if (!billingInput) return;
  const amount = getBillingFromRate(rateId);
  billingInput.value = amount ? amount.toFixed(3) : '';
}

function evaluateAlerts() {
  const alerts = [];
  const today = kuwaitNow();
  state.units.forEach((unit) => {
    if (unit.expiry) {
      const expiry = new Date(unit.expiry);
      const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
      if (diff <= 14) {
        alerts.push({
          title: `Unit ${unit.name} documents expiring in ${diff} days`,
          date: formatDate(unit.expiry),
        });
      }
    }
  });
  state.drivers.forEach((driver) => {
    if (driver.expiry) {
      const expiry = new Date(driver.expiry);
      const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
      if (diff <= 14) {
        alerts.push({
          title: `Driver ${driver.name} license expiring in ${diff} days`,
          date: formatDate(driver.expiry),
        });
      }
    }
  });
  state.attachments.forEach((attachment) => {
    if (attachment.expiry) {
      const expiry = new Date(attachment.expiry);
      const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
      if (diff <= 14) {
        alerts.push({
          title: `${attachment.entity} ${attachment.reference} document expiring in ${diff} days`,
          date: formatDate(attachment.expiry),
        });
      }
    }
  });
  state.invoices.forEach((invoice) => {
    if (invoice.status !== 'Paid') {
      const due = new Date(invoice.due);
      const diff = Math.ceil((today - due) / (1000 * 60 * 60 * 24));
      if (diff > 0) {
        alerts.push({
          title: `Invoice ${invoice.number} overdue by ${diff} days`,
          date: formatDate(invoice.due),
        });
      }
    }
  });
  state.bills.forEach((bill) => {
    if (bill.status !== 'Paid') {
      const due = new Date(bill.due);
      const diff = Math.ceil((today - due) / (1000 * 60 * 60 * 24));
      if (diff > 0) {
        alerts.push({
          title: `Bill ${bill.number} overdue by ${diff} days`,
          date: formatDate(bill.due),
        });
      }
    }
  });
  renderAlerts(alerts);
}

function handleNavigation() {
  const buttons = document.querySelectorAll('.nav-btn');
  buttons.forEach((button) =>
    button.addEventListener('click', () => {
      const target = button.dataset.target;
      buttons.forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');
      document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));
      document.getElementById(`panel-${target}`)?.classList.add('active');
    })
  );
}

function bindExports() {
  document.querySelectorAll('[data-export]').forEach((button) => {
    button.addEventListener('click', () => {
      const dataset = button.dataset.export;
      exportDataset(dataset);
    });
  });
  document.getElementById('btn-export-dashboard')?.addEventListener('click', exportDashboard);
}

function exportDataset(dataset) {
  const mapping = {
    units: state.units,
    drivers: state.drivers,
    customers: state.customers,
    suppliers: state.suppliers,
    rentalOrders: state.rentalOrders,
    hireOrders: state.hireOrders,
    timesheets: state.timesheets,
    invoices: state.invoices,
    bills: state.bills,
    rates: state.rates,
  };
  const data = mapping[dataset] || [];
  if (!data.length) {
    alert('Nothing to export yet.');
    return;
  }
  const header = Object.keys(data[0]);
  const rows = data.map((item) => header.map((key) => JSON.stringify(item[key] ?? '')).join(','));
  const csvContent = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${dataset}-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportDashboard() {
  const dashboard = document.getElementById('panel-dashboard');
  if (!dashboard) return;
  const blob = new Blob([dashboard.innerText], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dashboard-${Date.now()}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function bindPrint() {
  document.getElementById('btn-print-dashboard')?.addEventListener('click', () => {
    window.print();
    addAudit('Dashboard printed');
  });
}

function bindStatement() {
  document.getElementById('btn-generate-statement')?.addEventListener('click', () => {
    const win = window.open('', '_blank');
    const rows = state.invoices
      .map(
        (invoice) => `
        <tr>
          <td>${invoice.number}</td>
          <td>${findCustomer(invoice.customer)?.name || ''}</td>
          <td>${formatDate(invoice.date)}</td>
          <td>${formatDate(invoice.due)}</td>
          <td>${invoice.balance?.toFixed?.(3) || '0.000'} ${invoice.currency}</td>
        </tr>`
      )
      .join('');
    win.document.write(`
      <html><head><title>Customer Statement</title></head>
      <body>
        <h1>Customer Statement</h1>
        <table border="1" cellpadding="6" cellspacing="0">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Issue</th>
              <th>Due</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body></html>
    `);
    win.document.close();
    win.focus();
  });
}

function generatePDF(type, entity) {
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>${type} Document</title></head>
    <body>
      <h1>${type}</h1>
      <pre>${JSON.stringify(entity, null, 2)}</pre>
    </body></html>
  `);
  win.document.close();
  win.focus();
}

function bindRoleSelector() {
  const selector = document.getElementById('role-selector');
  selector?.addEventListener('change', (event) => setRole(event.target.value));
}

function updateTime() {
  const timeElement = document.getElementById('kuwait-time');
  if (!timeElement) return;
  timeElement.textContent = kuwaitNow().toLocaleString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: TIMEZONE,
  });
}

function bindRoleClassNames() {
  document.body.dataset.role = activeRole;
}

function bindNavScroll() {
  const nav = document.querySelector('.app-nav');
  if (!nav) return;
  nav.addEventListener('wheel', (event) => {
    if (window.innerWidth < 768) {
      nav.scrollLeft += event.deltaY;
    }
  });
}

function bindRentalRateSync() {
  const form = document.getElementById('form-rental-order');
  if (!form) return;
  const unitSelect = form.querySelector('select[name="unit"]');
  const typeSelect = form.querySelector('select[name="rateType"]');
  const rateSelect = form.querySelector('select[name="rateId"]');
  unitSelect?.addEventListener('change', renderRentalRateOptions);
  typeSelect?.addEventListener('change', renderRentalRateOptions);
  rateSelect?.addEventListener('change', syncRentalBillingBasis);
}

function bindEvents() {
  bindForms();
  handleNavigation();
  bindExports();
  bindPrint();
  bindStatement();
  bindRoleSelector();
  bindRoleClassNames();
  toggleRolePermissions();
  bindNavScroll();
  bindRentalRateSync();
  renderUnitOptions();
  renderCustomerOptions();
  renderSupplierOptions();
  renderDriverOptions();
  renderTimesheetOptions();
  renderBillOptions();
  renderRentalRateOptions();
  setInterval(updateTime, 1000);
  updateTime();
  renderAll();
}

document.addEventListener('DOMContentLoaded', bindEvents);
