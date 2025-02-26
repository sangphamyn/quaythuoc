import { PrismaClient, UserRole, PaymentStatus, PaymentMethod, InvoiceStatus, TransactionType, TransactionRelatedType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Xóa dữ liệu cũ (nếu cần)
  await prisma.transaction.deleteMany({});
  await prisma.invoiceItem.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.purchaseOrderItem.deleteMany({});
  await prisma.purchaseOrder.deleteMany({});
  await prisma.inventory.deleteMany({});
  await prisma.productUnit.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.usageRoute.deleteMany({});
  await prisma.unit.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.compartment.deleteMany({});
  await prisma.row.deleteMany({});
  await prisma.cabinet.deleteMany({});
  await prisma.user.deleteMany({});

  // 1. User
  const hashedPassword = 'password123';
  
  const users = await Promise.all([
    prisma.user.create({
      data: {
        username: 'admin',
        password: hashedPassword,
        fullName: 'Nguyễn Văn Admin',
        role: UserRole.ADMIN,
        email: 'admin@pharmacy.com',
        phone: '0901234567',
      },
    }),
    prisma.user.create({
      data: {
        username: 'staff1',
        password: hashedPassword,
        fullName: 'Phạm Thị Nhân Viên',
        role: UserRole.STAFF,
        email: 'staff1@pharmacy.com',
        phone: '0912345678',
      },
    }),
    prisma.user.create({
      data: {
        username: 'staff2',
        password: hashedPassword,
        fullName: 'Trần Văn Dược Sĩ',
        role: UserRole.STAFF,
        email: 'staff2@pharmacy.com',
        phone: '0923456789',
      },
    }),
    prisma.user.create({
      data: {
        username: 'staff3',
        password: hashedPassword,
        fullName: 'Lê Thị Thu Ngân',
        role: UserRole.STAFF,
        email: 'staff3@pharmacy.com',
        phone: '0934567890',
      },
    }),
    prisma.user.create({
      data: {
        username: 'staff4',
        password: hashedPassword,
        fullName: 'Hoàng Minh Kho',
        role: UserRole.STAFF,
        email: 'staff4@pharmacy.com',
        phone: '0945678901',
      },
    }),
  ]);

  console.log(`Created ${users.length} users`);

  // 2. Cabinet
  const cabinets = await Promise.all([
    prisma.cabinet.create({
      data: {
        name: 'Tủ thuốc kê đơn',
        description: 'Thuốc kê đơn, thuốc bảo quản đặc biệt',
      },
    }),
    prisma.cabinet.create({
      data: {
        name: 'Tủ thuốc OTC',
        description: 'Thuốc không kê đơn, bán trực tiếp',
      },
    }),
    prisma.cabinet.create({
      data: {
        name: 'Tủ thực phẩm chức năng',
        description: 'Các sản phẩm bổ sung dinh dưỡng và vitamin',
      },
    }),
    prisma.cabinet.create({
      data: {
        name: 'Tủ dụng cụ y tế',
        description: 'Băng gạc, kim tiêm, ống nghe',
      },
    }),
    prisma.cabinet.create({
      data: {
        name: 'Tủ mỹ phẩm',
        description: 'Sản phẩm chăm sóc da, dầu gội, sữa tắm',
      },
    }),
  ]);

  console.log(`Created ${cabinets.length} cabinets`);

  // 3. Row
  const rows = await Promise.all([
    prisma.row.create({
      data: {
        cabinetId: cabinets[0].id,
        name: 'Hàng A1',
        description: 'Thuốc kháng sinh',
      },
    }),
    prisma.row.create({
      data: {
        cabinetId: cabinets[0].id,
        name: 'Hàng A2',
        description: 'Thuốc tim mạch',
      },
    }),
    prisma.row.create({
      data: {
        cabinetId: cabinets[0].id,
        name: 'Hàng A3',
        description: 'Thuốc tiểu đường',
      },
    }),
    prisma.row.create({
      data: {
        cabinetId: cabinets[1].id,
        name: 'Hàng B1',
        description: 'Thuốc giảm đau, hạ sốt',
      },
    }),
    prisma.row.create({
      data: {
        cabinetId: cabinets[1].id,
        name: 'Hàng B2',
        description: 'Thuốc ho, cảm',
      },
    }),
    prisma.row.create({
      data: {
        cabinetId: cabinets[2].id,
        name: 'Hàng C1',
        description: 'Vitamin tổng hợp',
      },
    }),
    prisma.row.create({
      data: {
        cabinetId: cabinets[2].id,
        name: 'Hàng C2',
        description: 'Thực phẩm bổ sung',
      },
    }),
    prisma.row.create({
      data: {
        cabinetId: cabinets[3].id,
        name: 'Hàng D1',
        description: 'Vật tư tiêu hao',
      },
    }),
    prisma.row.create({
      data: {
        cabinetId: cabinets[4].id,
        name: 'Hàng E1',
        description: 'Mỹ phẩm cao cấp',
      },
    }),
    prisma.row.create({
      data: {
        cabinetId: cabinets[4].id,
        name: 'Hàng E2',
        description: 'Mỹ phẩm phổ thông',
      },
    }),
  ]);

  console.log(`Created ${rows.length} rows`);

  // 4. Compartment
  const compartments = await Promise.all([
    prisma.compartment.create({
      data: {
        rowId: rows[0].id,
        name: 'Ngăn A1-1',
        description: 'Kháng sinh beta-lactam',
      },
    }),
    prisma.compartment.create({
      data: {
        rowId: rows[0].id,
        name: 'Ngăn A1-2',
        description: 'Kháng sinh quinolone',
      },
    }),
    prisma.compartment.create({
      data: {
        rowId: rows[1].id,
        name: 'Ngăn A2-1',
        description: 'Thuốc huyết áp',
      },
    }),
    prisma.compartment.create({
      data: {
        rowId: rows[1].id,
        name: 'Ngăn A2-2',
        description: 'Thuốc mỡ máu',
      },
    }),
    prisma.compartment.create({
      data: {
        rowId: rows[2].id,
        name: 'Ngăn A3-1',
        description: 'Thuốc tiểu đường đường uống',
      },
    }),
    prisma.compartment.create({
      data: {
        rowId: rows[3].id,
        name: 'Ngăn B1-1',
        description: 'Paracetamol',
      },
    }),
    prisma.compartment.create({
      data: {
        rowId: rows[3].id,
        name: 'Ngăn B1-2',
        description: 'Ibuprofen',
      },
    }),
    prisma.compartment.create({
      data: {
        rowId: rows[4].id,
        name: 'Ngăn B2-1',
        description: 'Thuốc ho',
      },
    }),
    prisma.compartment.create({
      data: {
        rowId: rows[5].id,
        name: 'Ngăn C1-1',
        description: 'Vitamin tổng hợp',
      },
    }),
    prisma.compartment.create({
      data: {
        rowId: rows[6].id,
        name: 'Ngăn C2-1',
        description: 'Viên uống collagen',
      },
    }),
    prisma.compartment.create({
      data: {
        rowId: rows[7].id,
        name: 'Ngăn D1-1',
        description: 'Bông băng gạc',
      },
    }),
    prisma.compartment.create({
      data: {
        rowId: rows[8].id,
        name: 'Ngăn E1-1',
        description: 'Kem dưỡng da',
      },
    }),
  ]);

  console.log(`Created ${compartments.length} compartments`);

  // 5. Category
  const categories = await Promise.all([
    prisma.category.create({
      data: {
        name: 'Thuốc kê đơn',
        description: 'Thuốc cần kê đơn của bác sĩ',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Thuốc không kê đơn',
        description: 'Thuốc OTC',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Thực phẩm chức năng',
        description: 'Thực phẩm bổ sung',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Dụng cụ y tế',
        description: 'Vật tư y tế',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Mỹ phẩm',
        description: 'Sản phẩm chăm sóc cá nhân',
      },
    }),
  ]);

  // Tạo danh mục con
  const subcategories = await Promise.all([
    prisma.category.create({
      data: {
        name: 'Kháng sinh',
        parentId: categories[0].id,
        description: 'Thuốc kháng sinh',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Tim mạch',
        parentId: categories[0].id,
        description: 'Thuốc tim mạch',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Tiểu đường',
        parentId: categories[0].id,
        description: 'Thuốc điều trị tiểu đường',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Giảm đau, hạ sốt',
        parentId: categories[1].id,
        description: 'Thuốc giảm đau, hạ sốt',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Ho, cảm',
        parentId: categories[1].id,
        description: 'Thuốc ho, cảm',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Vitamin',
        parentId: categories[2].id,
        description: 'Vitamin và khoáng chất',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Collagen',
        parentId: categories[2].id,
        description: 'Thực phẩm bổ sung collagen',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Băng gạc',
        parentId: categories[3].id,
        description: 'Băng gạc y tế',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Dưỡng da',
        parentId: categories[4].id,
        description: 'Sản phẩm dưỡng da',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Chăm sóc tóc',
        parentId: categories[4].id,
        description: 'Sản phẩm chăm sóc tóc',
      },
    }),
  ]);

  const allCategories = [...categories, ...subcategories];
  console.log(`Created ${allCategories.length} categories`);

  // 6. Unit
  const units = await Promise.all([
    prisma.unit.create({
      data: {
        name: 'Viên',
        description: 'Đơn vị tính cho thuốc viên',
      },
    }),
    prisma.unit.create({
      data: {
        name: 'Vỉ',
        description: 'Vỉ thuốc (thường 10-20 viên)',
      },
    }),
    prisma.unit.create({
      data: {
        name: 'Hộp',
        description: 'Hộp (thường 1-10 vỉ)',
      },
    }),
    prisma.unit.create({
      data: {
        name: 'Chai',
        description: 'Đơn vị tính cho thuốc nước',
      },
    }),
    prisma.unit.create({
      data: {
        name: 'Lọ',
        description: 'Đơn vị tính cho thuốc bột, kem',
      },
    }),
    prisma.unit.create({
      data: {
        name: 'Ống',
        description: 'Đơn vị tính cho thuốc tiêm',
      },
    }),
    prisma.unit.create({
      data: {
        name: 'Gói',
        description: 'Đơn vị tính cho thuốc gói',
      },
    }),
    prisma.unit.create({
      data: {
        name: 'Miếng',
        description: 'Đơn vị tính cho băng gạc',
      },
    }),
    prisma.unit.create({
      data: {
        name: 'Tuýp',
        description: 'Đơn vị tính cho kem, gel',
      },
    }),
    prisma.unit.create({
      data: {
        name: 'Cái',
        description: 'Đơn vị tính cho dụng cụ',
      },
    }),
  ]);

  console.log(`Created ${units.length} units`);

  // 7. UsageRoute
  const usageRoutes = await Promise.all([
    prisma.usageRoute.create({
      data: {
        name: 'Đường uống',
        description: 'Uống qua đường miệng',
      },
    }),
    prisma.usageRoute.create({
      data: {
        name: 'Tiêm bắp',
        description: 'Tiêm bắp',
      },
    }),
    prisma.usageRoute.create({
      data: {
        name: 'Tiêm tĩnh mạch',
        description: 'Tiêm tĩnh mạch',
      },
    }),
    prisma.usageRoute.create({
      data: {
        name: 'Bôi ngoài da',
        description: 'Sử dụng trên da',
      },
    }),
    prisma.usageRoute.create({
      data: {
        name: 'Nhỏ mắt',
        description: 'Nhỏ mắt',
      },
    }),
    prisma.usageRoute.create({
      data: {
        name: 'Nhỏ mũi',
        description: 'Nhỏ mũi',
      },
    }),
    prisma.usageRoute.create({
      data: {
        name: 'Nhỏ tai',
        description: 'Nhỏ tai',
      },
    }),
    prisma.usageRoute.create({
      data: {
        name: 'Ngậm',
        description: 'Ngậm dưới lưỡi',
      },
    }),
    prisma.usageRoute.create({
      data: {
        name: 'Hít',
        description: 'Hít qua đường hô hấp',
      },
    }),
    prisma.usageRoute.create({
      data: {
        name: 'Đặt',
        description: 'Đặt âm đạo, hậu môn',
      },
    }),
  ]);

  console.log(`Created ${usageRoutes.length} usage routes`);

  // 8. Product
  const products = await Promise.all([
    prisma.product.create({
      data: {
        code: 'P001',
        name: 'Amoxicillin 500mg',
        categoryId: subcategories[0].id,
        usageRouteId: usageRoutes[0].id,
        description: 'Kháng sinh nhóm beta-lactam',
        compartmentId: compartments[0].id,
        baseUnitId: units[0].id,
      },
    }),
    prisma.product.create({
      data: {
        code: 'P002',
        name: 'Ciprofloxacin 500mg',
        categoryId: subcategories[0].id,
        usageRouteId: usageRoutes[0].id,
        description: 'Kháng sinh nhóm quinolone',
        compartmentId: compartments[1].id,
        baseUnitId: units[0].id,
      },
    }),
    prisma.product.create({
      data: {
        code: 'P003',
        name: 'Amlodipine 5mg',
        categoryId: subcategories[1].id,
        usageRouteId: usageRoutes[0].id,
        description: 'Thuốc hạ huyết áp',
        compartmentId: compartments[2].id,
        baseUnitId: units[0].id,
      },
    }),
    prisma.product.create({
      data: {
        code: 'P004',
        name: 'Atorvastatin 10mg',
        categoryId: subcategories[1].id,
        usageRouteId: usageRoutes[0].id,
        description: 'Thuốc hạ mỡ máu',
        compartmentId: compartments[3].id,
        baseUnitId: units[0].id,
      },
    }),
    prisma.product.create({
      data: {
        code: 'P005',
        name: 'Metformin 500mg',
        categoryId: subcategories[2].id,
        usageRouteId: usageRoutes[0].id,
        description: 'Thuốc điều trị tiểu đường',
        compartmentId: compartments[4].id,
        baseUnitId: units[0].id,
      },
    }),
    prisma.product.create({
      data: {
        code: 'P006',
        name: 'Paracetamol 500mg',
        categoryId: subcategories[3].id,
        usageRouteId: usageRoutes[0].id,
        description: 'Thuốc giảm đau, hạ sốt',
        compartmentId: compartments[5].id,
        baseUnitId: units[0].id,
      },
    }),
    prisma.product.create({
      data: {
        code: 'P007',
        name: 'Ibuprofen 400mg',
        categoryId: subcategories[3].id,
        usageRouteId: usageRoutes[0].id,
        description: 'Thuốc giảm đau, chống viêm',
        compartmentId: compartments[6].id,
        baseUnitId: units[0].id,
      },
    }),
    prisma.product.create({
      data: {
        code: 'P008',
        name: 'Bromhexine 8mg',
        categoryId: subcategories[4].id,
        usageRouteId: usageRoutes[0].id,
        description: 'Thuốc long đờm',
        compartmentId: compartments[7].id,
        baseUnitId: units[0].id,
      },
    }),
    prisma.product.create({
      data: {
        code: 'P009',
        name: 'Centrum Silver',
        categoryId: subcategories[5].id,
        usageRouteId: usageRoutes[0].id,
        description: 'Vitamin tổng hợp cho người trên 50 tuổi',
        compartmentId: compartments[8].id,
        baseUnitId: units[0].id,
      },
    }),
    prisma.product.create({
      data: {
        code: 'P010',
        name: 'DHC Collagen',
        categoryId: subcategories[6].id,
        usageRouteId: usageRoutes[0].id,
        description: 'Thực phẩm bổ sung collagen',
        compartmentId: compartments[9].id,
        baseUnitId: units[0].id,
      },
    }),
    prisma.product.create({
      data: {
        code: 'P011',
        name: 'Băng cá nhân Urgo',
        categoryId: subcategories[7].id,
        description: 'Băng cá nhân kháng khuẩn',
        compartmentId: compartments[10].id,
        baseUnitId: units[7].id,
      },
    }),
    prisma.product.create({
      data: {
        code: 'P012',
        name: 'Kem dưỡng Cetaphil',
        categoryId: subcategories[8].id,
        usageRouteId: usageRoutes[3].id,
        description: 'Kem dưỡng ẩm cho da nhạy cảm',
        compartmentId: compartments[11].id,
        baseUnitId: units[8].id,
      },
    }),
  ]);

  console.log(`Created ${products.length} products`);

  // 9. ProductUnit
  const productUnits = [];
  for (const product of products) {
    // Đơn vị cơ bản (viên, miếng, tuýp)
    const baseUnit = await prisma.productUnit.create({
      data: {
        productId: product.id,
        unitId: product.baseUnitId,
        conversionFactor: 1,
        costPrice: Math.floor(Math.random() * 10000) + 1000,
        sellingPrice: Math.floor(Math.random() * 15000) + 2000,
        isBaseUnit: true,
      },
    });
    productUnits.push(baseUnit);

    // Đơn vị vỉ (10 viên) - chỉ áp dụng cho thuốc viên
    if (product.baseUnitId === units[0].id) {
      const viUnit = await prisma.productUnit.create({
        data: {
          productId: product.id,
          unitId: units[1].id,
          conversionFactor: 10,
          costPrice: baseUnit.costPrice * 10 * 0.95, // giảm giá khi mua số lượng
          sellingPrice: baseUnit.sellingPrice * 10 * 0.97,
          isBaseUnit: false,
        },
      });
      productUnits.push(viUnit);

      // Đơn vị hộp (3 vỉ)
      const hopUnit = await prisma.productUnit.create({
        data: {
          productId: product.id,
          unitId: units[2].id,
          conversionFactor: 30,
          costPrice: baseUnit.costPrice * 30 * 0.9,
          sellingPrice: baseUnit.sellingPrice * 30 * 0.95,
          isBaseUnit: false,
        },
      });
      productUnits.push(hopUnit);
    }
  }

  console.log(`Created ${productUnits.length} product units`);

  // 10. Supplier
  const suppliers = await Promise.all([
    prisma.supplier.create({
      data: {
        name: 'Công ty Dược phẩm Hà Tây',
        address: '12 Quang Trung, Hà Đông, Hà Nội',
        phone: '0243123456',
        email: 'hatay@pharma.com',
        contactPerson: 'Nguyễn Văn A',
        notes: 'Nhà cung cấp thuốc generic',
      },
    }),
    prisma.supplier.create({
      data: {
        name: 'Công ty CP Dược Hậu Giang',
        address: '288 Bis Nguyễn Văn Cừ, An Hòa, Ninh Kiều, Cần Thơ',
        phone: '02923891433',
        email: 'dhg@pharma.com',
        contactPerson: 'Trần Thị B',
        notes: 'Nhà sản xuất thuốc lớn',
      },
    }),
    prisma.supplier.create({
      data: {
        name: 'Zuellig Pharma',
        address: '456 Nguyễn Thị Minh Khai, Quận 3, HCM',
        phone: '0283123456',
        email: 'zuellig@pharma.com',
        contactPerson: 'John Smith',
        notes: 'Nhà phân phối thuốc nhập khẩu',
      },
    }),
    prisma.supplier.create({
      data: {
        name: 'Công ty Dược phẩm Traphaco',
        address: '75 Yên Ninh, Ba Đình, Hà Nội',
        phone: '0243823479',
        email: 'traphaco@pharma.com',
        contactPerson: 'Lê Văn C',
        notes: 'Nhà sản xuất dược phẩm từ thảo dược',
      },
    }),
    prisma.supplier.create({
      data: {
        name: 'Imexpharm',
        address: '04 Đường 30/4, Phường 1, TP Cao Lãnh, Đồng Tháp',
        phone: '0277205155',
        email: 'imex@pharma.com',
        contactPerson: 'Hoàng Thị D',
        notes: 'Nhà sản xuất thuốc chất lượng cao',
      },
    }),
  ]);

  console.log(`Created ${suppliers.length} suppliers`);

  // 11. PurchaseOrder
  const purchaseOrders = [];
  for (let i = 0; i < 10; i++) {
    const poDate = new Date();
    poDate.setDate(poDate.getDate() - Math.floor(Math.random() * 60));
    
    const po = await prisma.purchaseOrder.create({
      data: {
        code: `PO${String(i + 1).padStart(3, '0')}`,
        supplierId: suppliers[Math.floor(Math.random() * suppliers.length)].id,
        userId: users[Math.floor(Math.random() * users.length)].id,
        orderDate: poDate,
        totalAmount: 0, // Sẽ cập nhật sau
        paymentStatus: Object.values(PaymentStatus)[Math.floor(Math.random() * Object.values(PaymentStatus).length)],
        paymentMethod: Object.values(PaymentMethod)[Math.floor(Math.random() * Object.values(PaymentMethod).length)],
        notes: `Đơn hàng nhập ngày ${poDate.toLocaleDateString('vi-VN')}`,
      },
    });
    purchaseOrders.push(po);
  }

  console.log(`Created ${purchaseOrders.length} purchase orders`);

  // 12. PurchaseOrderItem
  const purchaseItems = [];
  let totalByPO = new Map();

  for (const po of purchaseOrders) {
    const itemCount = Math.floor(Math.random() * 5) + 1;
    let poTotal = 0;
    
    for (let i = 0; i < itemCount; i++) {
      const product = products[Math.floor(Math.random() * products.length)];
      
      // Tìm đơn vị tính của sản phẩm
      const productUnitOptions = await prisma.productUnit.findMany({
        where: { productId: product.id },
      });
      
      const selectedProductUnit = productUnitOptions[Math.floor(Math.random() * productUnitOptions.length)];
      
      const quantity = Math.floor(Math.random() * 10) + 1;
      const costPrice = selectedProductUnit.costPrice;
      const itemTotal = quantity * costPrice;
      poTotal += itemTotal;
      
    const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + Math.floor(Math.random() * 24) + 6); // Hạn sử dụng 6-30 tháng
      
      const batchNumber = `BT${String(Math.floor(Math.random() * 9000) + 1000)}`;
      
      const item = await prisma.purchaseOrderItem.create({
        data: {
          purchaseOrderId: po.id,
          productId: product.id,
          productUnitId: selectedProductUnit.id,
          quantity: quantity,
          costPrice: costPrice,
          expiryDate: expiryDate,
          batchNumber: batchNumber,
        },
      });
      
      purchaseItems.push(item);
      
      // Cập nhật hoặc tạo mới tồn kho
      const existingInventory = await prisma.inventory.findFirst({
        where: {
          productId: product.id,
          productUnitId: selectedProductUnit.id,
          batchNumber: batchNumber,
          expiryDate: expiryDate,
        },
      });
      
      if (existingInventory) {
        await prisma.inventory.update({
          where: { id: existingInventory.id },
          data: { quantity: existingInventory.quantity + quantity },
        });
      } else {
        await prisma.inventory.create({
          data: {
            productId: product.id,
            productUnitId: selectedProductUnit.id,
            quantity: quantity,
            batchNumber: batchNumber,
            expiryDate: expiryDate,
          },
        });
      }
    }
    
    totalByPO.set(po.id, poTotal);
    
    // Cập nhật tổng tiền cho đơn hàng
    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { totalAmount: poTotal },
    });
  }

  console.log(`Created ${purchaseItems.length} purchase order items`);

  // 13. Invoice
  const invoices = [];
  const customers = [
    { name: 'Khách lẻ', phone: null },
    { name: 'Nguyễn Thị Hương', phone: '0912345678' },
    { name: 'Trần Văn Tâm', phone: '0923456789' },
    { name: 'Lê Minh Tuấn', phone: '0934567890' },
    { name: 'Phạm Thanh Hà', phone: '0945678901' },
  ];

  for (let i = 0; i < 15; i++) {
    const invoiceDate = new Date();
    invoiceDate.setDate(invoiceDate.getDate() - Math.floor(Math.random() * 30));
    
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const discount = Math.floor(Math.random() * 10) * 10000; // Giảm giá 0-90.000đ
    
    const invoice = await prisma.invoice.create({
      data: {
        code: `IV${String(i + 1).padStart(3, '0')}`,
        customerName: customer.name,
        customerPhone: customer.phone,
        userId: users[Math.floor(Math.random() * users.length)].id,
        invoiceDate: invoiceDate,
        totalAmount: 0, // Sẽ cập nhật sau
        discount: discount,
        finalAmount: 0, // Sẽ cập nhật sau
        paymentMethod: Object.values(PaymentMethod)[Math.floor(Math.random() * Object.values(PaymentMethod).length)],
        status: InvoiceStatus.COMPLETED,
        notes: `Hóa đơn bán lẻ ngày ${invoiceDate.toLocaleDateString('vi-VN')}`,
      },
    });
    
    invoices.push(invoice);
  }

  console.log(`Created ${invoices.length} invoices`);

  // 14. InvoiceItem
  const invoiceItems = [];
  // 15. Transaction
  const transactions = [];

  for (const invoice of invoices) {
    const itemCount = Math.floor(Math.random() * 5) + 1;
    let invoiceTotal = 0;
    
    for (let i = 0; i < itemCount; i++) {
      // Tìm sản phẩm có tồn kho
      const inventories = await prisma.inventory.findMany({
        where: { quantity: { gt: 0 } },
        include: {
          product: true,
          productUnit: true,
        },
      });
      
      if (inventories.length === 0) continue;
      
      const selectedInventory = inventories[Math.floor(Math.random() * inventories.length)];
      const quantity = Math.min(
        Math.floor(Math.random() * 5) + 1,
        Math.floor(selectedInventory.quantity)
      );
      
      if (quantity <= 0) continue;
      
      const unitPrice = selectedInventory.productUnit.sellingPrice;
      const amount = quantity * unitPrice;
      invoiceTotal += amount;
      
      const item = await prisma.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          productId: selectedInventory.productId,
          productUnitId: selectedInventory.productUnitId,
          quantity: quantity,
          unitPrice: unitPrice,
          amount: amount,
        },
      });
      
      invoiceItems.push(item);
      
      // Cập nhật lại tồn kho
      await prisma.inventory.update({
        where: { id: selectedInventory.id },
        data: { quantity: selectedInventory.quantity - quantity },
      });
    }
    
    // Cập nhật tổng tiền và số tiền cuối cho hóa đơn
    const finalAmount = Math.max(0, invoiceTotal - invoice.discount);
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        totalAmount: invoiceTotal,
        finalAmount: finalAmount,
      },
    });

    const transaction = await prisma.transaction.create({
      data: {
        date: invoice.invoiceDate,
        type: TransactionType.INCOME,
        amount: finalAmount,
        description: `Thu tiền từ hóa đơn ${invoice.code}`,
        userId: invoice.userId,
        relatedType: TransactionRelatedType.INVOICE,
        invoiceId: invoice.id,
      },
    });
    
    transactions.push(transaction);
  }

  console.log(`Created ${invoiceItems.length} invoice items`);

  
  
  // Giao dịch cho phiếu nhập
  for (const po of purchaseOrders) {
    const poAmount = totalByPO.get(po.id) || 0;
    
    // Nếu trạng thái thanh toán là "đã thanh toán" hoặc "thanh toán một phần"
    if (po.paymentStatus === 'PAID' || po.paymentStatus === 'PARTIAL') {
      const paidAmount = po.paymentStatus === 'PAID' ? poAmount : poAmount * 0.5;
      
      const transaction = await prisma.transaction.create({
        data: {
          date: po.orderDate,
          type: TransactionType.EXPENSE,
          amount: paidAmount,
          description: `Thanh toán cho phiếu nhập ${po.code}`,
          userId: po.userId,
          relatedType: TransactionRelatedType.PURCHASE,
          purchaseOrderId: po.id,
        },
      });
      
      transactions.push(transaction);
    }
  }
  
  // Giao dịch cho hóa đơn
  // for (const invoice of invoices) {
  //   const transaction = await prisma.transaction.create({
  //     data: {
  //       date: invoice.invoiceDate,
  //       type: TransactionType.INCOME,
  //       amount: invoice.finalAmount,
  //       description: `Thu tiền từ hóa đơn ${invoice.code}`,
  //       userId: invoice.userId,
  //       relatedType: TransactionRelatedType.INVOICE,
  //       invoiceId: invoice.id,
  //     },
  //   });
    
  //   transactions.push(transaction);
  // }
  
  // Thêm một số giao dịch khác
  const otherTransactions = [
    {
      date: new Date(2025, 1, 10),
      type: TransactionType.EXPENSE,
      amount: 1500000,
      description: 'Chi tiền điện tháng 1/2025',
      userId: users[0].id,
      relatedType: TransactionRelatedType.OTHER,
    },
    {
      date: new Date(2025, 1, 12),
      type: TransactionType.EXPENSE,
      amount: 850000,
      description: 'Chi tiền nước tháng 1/2025',
      userId: users[0].id,
      relatedType: TransactionRelatedType.OTHER,
    },
    {
      date: new Date(2025, 1, 15),
      type: TransactionType.EXPENSE,
      amount: 3000000,
      description: 'Chi lương nhân viên Phạm Thị Nhân Viên',
      userId: users[0].id,
      relatedType: TransactionRelatedType.OTHER,
    },
    {
      date: new Date(2025, 1, 15),
      type: TransactionType.EXPENSE,
      amount: 3500000,
      description: 'Chi lương nhân viên Trần Văn Dược Sĩ',
      userId: users[0].id,
      relatedType: TransactionRelatedType.OTHER,
    },
    {
      date: new Date(2025, 1, 15),
      type: TransactionType.EXPENSE,
      amount: 2800000,
      description: 'Chi lương nhân viên Lê Thị Thu Ngân',
      userId: users[0].id,
      relatedType: TransactionRelatedType.OTHER,
    },
  ];
  
  for (const txData of otherTransactions) {
    const tx = await prisma.transaction.create({ data: txData });
    transactions.push(tx);
  }

  console.log(`Created ${transactions.length} transactions`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
