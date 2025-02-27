import { useState, useEffect, useRef } from 'react';
import { 
  json, 
  redirect,
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from '@remix-run/node';
import { 
  useLoaderData, 
  useSubmit, 
  useNavigation,
  Form,
  useSearchParams,
  Link
} from '@remix-run/react';
import { db } from '~/utils/db.server';
import { 
  TrashIcon, 
  PlusIcon, 
  XMarkIcon, 
  MagnifyingGlassIcon,
  ShoppingCartIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  UserIcon,
  PhoneIcon,
  CalendarDaysIcon,
  ReceiptRefundIcon,
  ClockIcon,
  ArrowDownTrayIcon,
  BanknotesIcon,
  QrCodeIcon,
  InformationCircleIcon,
  ChevronDoubleRightIcon,
  PhotoIcon,
  MapPinIcon,
  ArchiveBoxIcon,
  TableCellsIcon,
  ViewColumnsIcon
} from '@heroicons/react/24/outline';
import { getUserSession } from '~/utils/session.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await getUserSession(request);
  
  if (user.get('userRole') !== 'STAFF' && user.get('userRole') !== 'ADMIN') {
    return redirect('/');
  }

  // Fetch all products with details
  const products = await db.product.findMany({
    include: {
      productUnits: {
        include: {
          unit: true,
        },
      },
      category: true,
      usageRoute: true,
      compartment: {
        include: {
          row: {
            include: {
              cabinet: {
                include: {
                  rows: {
                    include: {
                      compartments: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
  });

  // Load inventory for each product
  const inventory = await db.inventory.findMany({
    select: {
      productId: true,
      productUnitId: true,
      quantity: true,
      expiryDate: true,
      batchNumber: true
    }
  });

  // Group inventory by product and unit
  const productInventory = inventory.reduce((acc, item) => {
    const key = `${item.productId}-${item.productUnitId}`;
    if (!acc[key]) {
      acc[key] = 0;
    }
    acc[key] += item.quantity;
    return acc;
  }, {} as Record<string, number>);

  // Generate a new invoice code (HD + current date + sequential number)
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  
  const latestInvoiceCode = await db.invoice.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { code: true },
  });
  
  let nextNumber = 1;
  if (latestInvoiceCode) {
    const lastCode = latestInvoiceCode.code;
    if (lastCode.startsWith('HD' + dateStr)) {
      nextNumber = parseInt(lastCode.substring(dateStr.length + 2)) + 1;
    }
  }
  
  const newInvoiceCode = `HD${dateStr}${String(nextNumber).padStart(4, '0')}`;

  // Get product categories for filtering
  const categories = await db.category.findMany({
    select: {
      id: true,
      name: true,
    }
  });

  // Get recent invoices from this user
  const recentInvoices = await db.invoice.findMany({
    where: {
      userId: Number(user.get('userId')),
      status: 'COMPLETED'
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 5,
    include: {
      items: {
        include: {
          product: true
        }
      }
    }
  });

  // Get popular products
  const popularProducts = await db.invoiceItem.groupBy({
    by: ['productId'],
    _sum: {
      quantity: true
    },
    orderBy: {
      _sum: {
        quantity: 'desc'
      }
    },
    take: 8
  });

  const popularProductIds = popularProducts.map(p => p.productId);
  
  const popularProductDetails = popularProductIds.length > 0 
    ? await db.product.findMany({
        where: {
          id: {
            in: popularProductIds
          }
        },
        include: {
          productUnits: {
            include: {
              unit: true
            }
          },
          compartment: {
            include: {
              row: {
                include: {
                  cabinet: {
                    include: {
                      rows: {
                        include: {
                          compartments: true
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          category: true,
          usageRoute: true
        }
      })
    : [];

  // Sort popular products by the same order as popularProductIds
  const sortedPopularProducts = popularProductIds.map(id => 
    popularProductDetails.find(product => product.id === id)
  ).filter(Boolean);

  return json({ 
    products, 
    categories,
    productInventory,
    user,
    newInvoiceCode,
    currentDate: today.toISOString().split('T')[0],
    recentInvoices,
    popularProducts: sortedPopularProducts
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUserSession(request);
  
  if (user.get('userRole') !== 'STAFF' && user.get('userRole') !== 'ADMIN') {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const action = formData.get('_action');

  if (action === 'createInvoice') {
    const code = formData.get('invoiceCode') as string;
    const customerName = formData.get('customerName') as string;
    const customerPhone = formData.get('customerPhone') as string;
    const invoiceDate = new Date(formData.get('invoiceDate') as string);
    const notes = formData.get('notes') as string;
    const totalAmount = parseFloat(formData.get('totalAmount') as string);
    const discount = parseFloat(formData.get('discount') as string) || 0;
    const finalAmount = parseFloat(formData.get('finalAmount') as string);
    const paymentMethod = formData.get('paymentMethod') as string;
    
    // Get all item keys
    const itemKeys = Array.from(formData.keys())
      .filter(key => key.startsWith('items[') && key.endsWith('][productId]'))
      .map(key => key.match(/items\[(\d+)\]/)?.[1] || '');

    // Create invoice
    const invoice = await db.invoice.create({
      data: {
        code,
        customerName,
        customerPhone,
        userId: Number(user.get('userId')),
        invoiceDate,
        totalAmount,
        discount,
        finalAmount,
        paymentMethod: paymentMethod as any,
        status: 'COMPLETED',
        notes,
        items: {
          create: itemKeys.map(index => {
            const productId = parseInt(formData.get(`items[${index}][productId]`) as string);
            const productUnitId = parseInt(formData.get(`items[${index}][productUnitId]`) as string);
            const quantity = parseFloat(formData.get(`items[${index}][quantity]`) as string);
            const unitPrice = parseFloat(formData.get(`items[${index}][unitPrice]`) as string);
            const amount = parseFloat(formData.get(`items[${index}][amount]`) as string);

            return {
              productId,
              productUnitId,
              quantity,
              unitPrice,
              amount,
            };
          }),
        }
      },
    });

    // Update inventory for each item
    for (const index of itemKeys) {
      const productId = parseInt(formData.get(`items[${index}][productId]`) as string);
      const productUnitId = parseInt(formData.get(`items[${index}][productUnitId]`) as string);
      const quantity = parseFloat(formData.get(`items[${index}][quantity]`) as string);

      // Get inventory items for this product/unit
      const inventoryItems = await db.inventory.findMany({
        where: {
          productId,
          productUnitId,
          quantity: { gt: 0 },
        },
        orderBy: {
          expiryDate: 'asc' // Use oldest stock first (FEFO - First Expired, First Out)
        },
      });

      let remainingQuantity = quantity;
      
      for (const item of inventoryItems) {
        if (remainingQuantity <= 0) break;
        
        const quantityToDeduct = Math.min(remainingQuantity, item.quantity);
        remainingQuantity -= quantityToDeduct;
        
        await db.inventory.update({
          where: { id: item.id },
          data: {
            quantity: item.quantity - quantityToDeduct,
          },
        });
      }
    }

    // Create transaction for the invoice
    await db.transaction.create({
      data: {
        date: invoiceDate,
        type: 'INCOME',
        amount: finalAmount,
        description: `Thu tiền bán hàng - Hóa đơn ${code}`,
        userId: Number(user.get('userId')),
        relatedType: 'INVOICE',
        invoiceId: invoice.id,
      },
    });

    return redirect(`/sales/invoices/${invoice.id}`);
  }

  return null;
};

export default function SalesPage() {
  const { products, categories, productInventory, user, newInvoiceCode, currentDate, recentInvoices, popularProducts } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [invoiceItems, setInvoiceItems] = useState<Array<{
    id: number;
    productId: number;
    productName: string;
    productUnitId: number;
    unitName: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    maxQuantity: number;
  }>>([]);

  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [cashReceived, setCashReceived] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'popular' | 'all' | 'recent'>('popular');
  const [showCartMobile, setShowCartMobile] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState("CASH");

  // Calculate totals
  const totalAmount = invoiceItems.reduce((sum, item) => sum + item.amount, 0);
  const finalAmount = totalAmount - discount;
  const change = cashReceived - finalAmount;
  const itemCount = invoiceItems.reduce((sum, item) => sum + item.quantity, 0);

  const filteredProducts = products.filter(product => {
    let matchesSearch = true;
    let matchesCategory = true;

    if (searchTerm) {
      matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                     product.code.toLowerCase().includes(searchTerm.toLowerCase());
    }

    if (selectedCategory) {
      matchesCategory = product.categoryId === selectedCategory;
    }

    return matchesSearch && matchesCategory;
  });

  // Effect to focus search input on mount
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const handleAddProduct = (product: any) => {
    setSelectedProduct(product);

    if (product.productUnits.length === 1) {
      handleSelectUnit(product.productUnits[0]);
    }
  };

  const handleSelectUnit = (unit: any) => {
    setSelectedUnit(unit);
    
    // Automatically add to cart if only one unit is available
    if (selectedProduct) {
      const productId = selectedProduct.id;
      const productUnitId = unit.id;
      const inventoryKey = `${productId}-${productUnitId}`;
      const availableQuantity = productInventory[inventoryKey] || 0;
      
      // Check if product already exists in cart
      const existingItem = invoiceItems.find(
        item => item.productId === productId && item.productUnitId === productUnitId
      );

      if (existingItem) {
        // Update quantity if already in cart
        handleUpdateQuantity(existingItem.id, existingItem.quantity + 1);
      } else {
        // Add new item to cart
        addToCart(selectedProduct, unit, 1, availableQuantity);
      }

      // Reset selection
      setSelectedProduct(null);
      setSelectedUnit(null);
      setQuantity(1);
      setSearchTerm('');
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }
  };

  const addToCart = (product: any, unit: any, qty: number, maxQty: number) => {
    const unitPrice = unit.sellingPrice;
    const amount = unitPrice * qty;

    setInvoiceItems([
      ...invoiceItems,
      {
        id: Date.now(), // temporary id for UI
        productId: product.id,
        productName: product.name,
        productUnitId: unit.id,
        unitName: unit.unit.name,
        quantity: qty,
        unitPrice,
        amount,
        maxQuantity: maxQty
      }
    ]);
  };

  const handleUpdateQuantity = (id: number, newQuantity: number) => {
    setInvoiceItems(
      invoiceItems.map(item => {
        if (item.id === id) {
          const qty = Math.min(Math.max(0.1, newQuantity), item.maxQuantity);
          return {
            ...item,
            quantity: qty,
            amount: item.unitPrice * qty
          };
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (id: number) => {
    setInvoiceItems(invoiceItems.filter(item => item.id !== id));
  };

  const handleClearCart = () => {
    setInvoiceItems([]);
    setDiscount(0);
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts.length === 1) {
        handleAddProduct(filteredProducts[0]);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (invoiceItems.length === 0) {
      alert('Vui lòng thêm ít nhất một sản phẩm vào hóa đơn');
      return;
    }

    const formData = new FormData(e.currentTarget);
    
    // Add invoice items to form data
    invoiceItems.forEach((item, index) => {
      formData.append(`items[${index}][productId]`, item.productId.toString());
      formData.append(`items[${index}][productUnitId]`, item.productUnitId.toString());
      formData.append(`items[${index}][quantity]`, item.quantity.toString());
      formData.append(`items[${index}][unitPrice]`, item.unitPrice.toString());
      formData.append(`items[${index}][amount]`, item.amount.toString());
    });

    // Add calculated values
    formData.append('totalAmount', totalAmount.toString());
    formData.append('finalAmount', finalAmount.toString());
    formData.append('_action', 'createInvoice');
    
    submit(formData, { method: 'post' });
    setShowPaymentModal(false);
  };

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] bg-gray-50 overflow-hidden">
      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Products */}
        <div className="w-full md:w-2/3 lg:w-3/4 flex flex-col h-full overflow-hidden border-r border-gray-200">
          {/* Tabs */}
          <div className="bg-white border-b border-gray-200">
            <div className="px-4">
              <div className="flex space-x-4 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('popular')}
                  className={`flex items-center px-3 py-4 border-b-2 font-medium text-sm whitespace-nowrap ${
                    activeTab === 'popular'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <FireIcon className={`h-5 w-5 mr-2 ${activeTab === 'popular' ? 'text-blue-600' : 'text-gray-400'}`} />
                  Sản phẩm phổ biến
                </button>
                <button
                  onClick={() => setActiveTab('all')}
                  className={`flex items-center px-3 py-4 border-b-2 font-medium text-sm whitespace-nowrap ${
                    activeTab === 'all'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <ViewGridIcon className={`h-5 w-5 mr-2 ${activeTab === 'all' ? 'text-blue-600' : 'text-gray-400'}`} />
                  Tất cả sản phẩm
                </button>
                <button
                  onClick={() => setActiveTab('recent')}
                  className={`flex items-center px-3 py-4 border-b-2 font-medium text-sm whitespace-nowrap ${
                    activeTab === 'recent'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <ClockIcon className={`h-5 w-5 mr-2 ${activeTab === 'recent' ? 'text-blue-600' : 'text-gray-400'}`} />
                  Hóa đơn gần đây
                </button>
              </div>
            </div>
          </div>

          {/* Search and Category Filter */}
          {activeTab !== 'recent' && (
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex items-center space-x-4">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Tìm kiếm sản phẩm (tên, mã)..."
                    className="pl-10 w-full py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={() => setShowCartMobile(true)}
                  className="relative md:hidden bg-blue-600 text-white p-2 rounded-md"
                >
                  <ShoppingCartIcon className="h-6 w-6" />
                  {invoiceItems.length > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {invoiceItems.length}
                    </span>
                  )}
                </button>
              </div>
              
              {/* Categories */}
              <div className="mt-4 flex space-x-2 overflow-x-auto pb-2">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap ${
                    selectedCategory === null
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200 border border-transparent'
                  }`}
                >
                  Tất cả
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(selectedCategory === category.id ? null : category.id)}
                    className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap ${
                      selectedCategory === category.id
                        ? 'bg-blue-100 text-blue-800 border border-blue-200'
                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200 border border-transparent'
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Main content area based on active tab */}
          <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'popular' && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Sản phẩm phổ biến</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {popularProducts.length > 0 ? (
                  popularProducts.map((product: any) => {
                    // Check if any unit has inventory
                    const hasInventory = product.productUnits.some((unit: any) => {
                      const inventoryKey = `${product.id}-${unit.id}`;
                      return (productInventory[inventoryKey] || 0) > 0;
                    });
                    
                    return (
                      <div
                        key={product.id}
                        onClick={() => hasInventory && handleAddProduct(product)}
                        className={`bg-white border rounded-xl overflow-hidden shadow-sm transition transform ${
                          hasInventory 
                            ? 'cursor-pointer hover:shadow-md hover:-translate-y-1 hover:border-blue-200'
                            : 'opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div className='flex items-center gap-4 justify-start px-4 py-4'>
                          <div className="w-24 h-24 shrink-0 overflow-hidden bg-gray-100 rounded-lg">
                            {product.image ? (
                              <img 
                                src={product.image} 
                                alt={product.name} 
                                className="w-full h-full object-cover object-center"
                              />
                            ) : (
                              <div className="w-full h-24 flex items-center justify-center bg-gray-100 text-gray-400">
                                <PhotoIcon className="h-12 w-12" />
                              </div>
                            )}
                          </div>
                          <div className="w-full">
                            <h3 className="font-medium text-gray-900 truncate">{product.name}</h3>
                            <p className="text-sm text-gray-500 truncate">Mã: {product.code}</p>
                            <div className="mt-2 flex justify-between items-center">
                              {product.productUnits.length > 0 ? (
                                <span className="text-blue-600 font-medium">
                                  {product.productUnits[0].sellingPrice.toLocaleString('vi-VN')} đ
                                </span>
                              ) : (
                                <span className="text-gray-500">Chưa có giá</span>
                              )}
                              {!hasInventory ? (
                                <span className="text-xs text-red-500 font-medium py-1 px-2 bg-red-50 rounded-full">Hết hàng</span>
                              ) : (
                                <button className="text-xs bg-blue-50 text-blue-600 font-medium py-1 px-2 rounded-full">
                                  Thêm
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full text-center py-10 text-gray-500">
                    Chưa có dữ liệu sản phẩm phổ biến
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'all' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => {
                  // Check if any unit has inventory
                  const hasInventory = product.productUnits.some((unit: any) => {
                    const inventoryKey = `${product.id}-${unit.id}`;
                    return (productInventory[inventoryKey] || 0) > 0;
                  });
                  
                  return (
                    <div
                      key={product.id}
                      onClick={() => hasInventory && handleAddProduct(product)}
                      className={`bg-white border rounded-xl overflow-hidden shadow-sm transition transform ${
                        hasInventory 
                          ? 'cursor-pointer hover:shadow-md hover:-translate-y-1 hover:border-blue-200'
                          : 'opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <div className='flex items-center gap-4 justify-start px-4 py-4'>
                          <div className="w-24 h-24 shrink-0 overflow-hidden bg-gray-100 rounded-lg">
                            {product.image ? (
                              <img 
                                src={product.image} 
                                alt={product.name} 
                                className="w-full h-full object-cover object-center"
                              />
                            ) : (
                              <div className="w-full h-24 flex items-center justify-center bg-gray-100 text-gray-400">
                                <PhotoIcon className="h-12 w-12" />
                              </div>
                            )}
                          </div>
                          <div className="w-full">
                            <h3 className="font-medium text-gray-900 truncate">{product.name}</h3>
                            <p className="text-sm text-gray-500 truncate">Mã: {product.code}</p>
                            <div className="mt-2 flex justify-between items-center">
                              {product.productUnits.length > 0 ? (
                                <span className="text-blue-600 font-medium">
                                  {product.productUnits[0].sellingPrice.toLocaleString('vi-VN')} đ
                                </span>
                              ) : (
                                <span className="text-gray-500">Chưa có giá</span>
                              )}
                              {!hasInventory ? (
                                <span className="text-xs text-red-500 font-medium py-1 px-2 bg-red-50 rounded-full">Hết hàng</span>
                              ) : (
                                <button className="text-xs bg-blue-50 text-blue-600 font-medium py-1 px-2 rounded-full">
                                  Thêm
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-full text-center py-10 text-gray-500">
                  Không tìm thấy sản phẩm phù hợp
                </div>
              )}
            </div>
          )}

            {activeTab === 'recent' && (
              <div>
                <h2 className="text-lg font-semibold mb-4">Hóa đơn gần đây của bạn</h2>
                {recentInvoices.length > 0 ? (
                  <div className="space-y-4">
                    {recentInvoices.map((invoice: any) => (
                      <Link
                        key={invoice.id}
                        to={`/sales/invoices/${invoice.id}`}
                        className="block bg-white border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition"
                      >
                        <div className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="font-medium text-blue-600">{invoice.code}</div>
                              <div className="text-sm text-gray-500">{formatDate(invoice.invoiceDate)}</div>
                            </div>
                            <div className="text-lg font-semibold text-gray-800">
                              {invoice.finalAmount.toLocaleString('vi-VN')} đ
                            </div>
                          </div>
                          <div className="mt-2">
                            <div className="text-sm text-gray-700">
                              <span className="font-medium">Khách hàng:</span> {invoice.customerName || 'Khách lẻ'}
                            </div>
                            <div className="text-sm text-gray-700 mt-1">
                              <span className="font-medium">Sản phẩm:</span> {invoice.items.length} sản phẩm
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className={`text-xs px-2 py-1 rounded-full ${
                              invoice.paymentMethod === 'CASH' 
                                ? 'bg-green-100 text-green-800' 
                                : invoice.paymentMethod === 'TRANSFER'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-orange-100 text-orange-800'
                            }`}>
                              {invoice.paymentMethod === 'CASH' ? 'Tiền mặt' : 
                               invoice.paymentMethod === 'TRANSFER' ? 'Chuyển khoản' : 'Công nợ'}
                            </div>
                            <span className="text-sm text-blue-600 font-medium">Xem chi tiết</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 text-gray-500">
                    Bạn chưa có hóa đơn nào gần đây
                  </div>
                )}
              </div>
            )}
          </div>

         {/* Product Detail Modal */}
          {selectedProduct && (
            <div 
              className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4"
              onClick={() => {
                setSelectedProduct(null);
                setSelectedUnit(null);
              }}
            >
              <div 
                className="bg-white rounded-xl max-w-4xl w-full shadow-xl overflow-hidden"
                onClick={(e) => e.stopPropagation()} // Ngăn sự kiện click lan ra ngoài
              >
                <div className="flex flex-col md:flex-row">
                  {/* Product Image */}
                  <div className="md:w-3/5 bg-gray-100">
                    {selectedProduct.image ? (
                      <img 
                        src={selectedProduct.image} 
                        alt={selectedProduct.name} 
                        className="w-full h-64 md:h-full object-cover object-center"
                      />
                    ) : (
                      <div className="w-full h-64 md:h-full flex items-center justify-center bg-gray-100 text-gray-400">
                        <PhotoIcon className="h-20 w-20" />
                      </div>
                    )}
                  </div>
                  
                  {/* Product Details */}
                  <div className="md:w-4/5 p-6 overflow-y-auto max-h-[80vh] md:max-h-[600px]">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900">{selectedProduct.name}</h3>
                        <p className="text-sm text-gray-500 mt-1">Mã: {selectedProduct.code}</p>
                        
                        {selectedProduct.category && (
                          <div className="mt-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {selectedProduct.category.name}
                            </span>
                          </div>
                        )}
                        
                        {selectedProduct.usageRoute && (
                          <p className="text-sm text-gray-600 mt-2">
                            Đường dùng: {selectedProduct.usageRoute.name}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setSelectedProduct(null);
                          setSelectedUnit(null);
                        }}
                        className="text-gray-400 hover:text-gray-500"
                      >
                        <XMarkIcon className="h-6 w-6" />
                      </button>
                    </div>
                    
                    {/* Vị trí trong tủ */}
                    {/* {selectedProduct.compartment && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <h4 className="text-sm font-medium text-blue-800 flex items-center">
                          <MapPinIcon className="h-4 w-4 mr-1" />
                          Vị trí trong tủ:
                        </h4>
                        <div className="mt-1 text-sm">
                          <div className="flex items-center text-gray-700">
                            <ArchiveBoxIcon className="h-4 w-4 mr-2 text-blue-600" />
                            <span>Tủ: <strong>{selectedProduct.compartment.row.cabinet.name}</strong></span>
                          </div>
                          <div className="flex items-center text-gray-700 mt-1">
                            <TableCellsIcon className="h-4 w-4 mr-2 text-blue-600" /> 
                            <span>Hàng: <strong>{selectedProduct.compartment.row.name}</strong></span>
                          </div>
                          <div className="flex items-center text-gray-700 mt-1">
                            <ViewColumnsIcon className="h-4 w-4 mr-2 text-blue-600" />
                            <span>Ngăn: <strong>{selectedProduct.compartment.name}</strong></span>
                          </div>
                        </div>
                      </div>
                    )} */}

                    {/* Vị trí trong tủ - Phiên bản trực quan */}
                    {selectedProduct.compartment && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-800 flex items-center">
                          <MapPinIcon className="h-4 w-4 mr-1" />
                          Vị trí sản phẩm:
                        </h4>
                        <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                          {/* Header - Tên tủ */}
                          <div className="bg-blue-500 text-white py-2 px-3 font-medium text-sm">
                            <ArchiveBoxIcon className="h-4 w-4 inline-block mr-1" />
                            Tủ: {selectedProduct.compartment.row.cabinet.name}
                          </div>
                          
                          {/* Các hàng trong tủ */}
                          <div className="divide-y divide-gray-200">
                            {selectedProduct.compartment.row.cabinet.rows.map((row: any) => (
                              <div key={row.id} className={`p-3 ${row.id === selectedProduct.compartment.rowId ? 'bg-blue-50' : 'bg-white'}`}>
                                <div className="flex items-center">
                                  <TableCellsIcon className={`h-4 w-4 mr-1 ${row.id === selectedProduct.compartment.rowId ? 'text-blue-600' : 'text-gray-400'}`} />
                                  <span className={`text-sm ${row.id === selectedProduct.compartment.rowId ? 'font-medium text-blue-700' : 'text-gray-700'}`}>
                                    Hàng: {row.name}
                                  </span>
                                </div>
                                
                                {/* Các ngăn trong hàng */}
                                <div className="mt-2 grid grid-cols-4 gap-2">
                                  {row.compartments.map((compartment: any) => (
                                    <div 
                                      key={compartment.id}
                                      className={`
                                        p-2 border rounded text-center text-xs
                                        ${compartment.id === selectedProduct.compartmentId 
                                          ? 'bg-blue-100 border-blue-300 text-blue-700 ring-2 ring-blue-500' 
                                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                        }
                                      `}
                                    >
                                      {compartment.id === selectedProduct.compartmentId && (
                                        <div className="flex justify-center mb-1">
                                          <CheckCircleIcon className="h-4 w-4 text-blue-500" />
                                        </div>
                                      )}
                                      {compartment.name}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {selectedProduct.description && (
                      <div className="mt-4">
                        <p className="text-sm text-gray-600">{selectedProduct.description}</p>
                      </div>
                    )}
                    
                    <div className="mt-6">
                      <p className="text-sm font-medium text-gray-700 mb-3">Chọn đơn vị:</p>
                      <div className="grid grid-cols-3 gap-3">
                        {selectedProduct.productUnits.map((unit: any) => {
                          const inventoryKey = `${selectedProduct.id}-${unit.id}`;
                          const availableQuantity = productInventory[inventoryKey] || 0;
                          
                          return (
                            <button
                              key={unit.id}
                              onClick={() => handleSelectUnit(unit)}
                              disabled={availableQuantity <= 0}
                              className={`px-4 py-3 rounded-lg text-left transition ${
                                availableQuantity > 0 
                                  ? 'border border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                                  : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                              }`}
                            >
                              <div className="font-medium">{unit.unit.name}</div>
                              <div className="text-blue-600 font-medium">
                                {unit.sellingPrice.toLocaleString('vi-VN')} đ
                              </div>
                              <div className={`text-xs mt-1 ${
                                availableQuantity > 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                Tồn: {availableQuantity}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Cart (Desktop) */}
        <div className="hidden md:flex md:w-1/3 lg:w-1/4 flex-col h-full bg-white border-l border-gray-200">
          {/* Cart Header */}
          <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Giỏ hàng</h2>
              <button
                onClick={handleClearCart}
                className="text-sm py-1 px-3 bg-blue-800 bg-opacity-30 hover:bg-opacity-50 rounded-md transition-all"
              >
                Làm mới
              </button>
            </div>
            <div className="text-sm text-blue-100 mt-1">
              {invoiceItems.length > 0 ? `${invoiceItems.length} sản phẩm (${itemCount.toFixed(1)} đơn vị)` : 'Chưa có sản phẩm'}
            </div>
          </div>
          
          {/* Customer Info */}
          <div className="border-b border-gray-200">
            <div className="p-4 space-y-3">
              <div className="flex items-center">
                <UserIcon className="h-5 w-5 text-gray-400 mr-2" />
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Tên khách hàng"
                  className="flex-1 text-sm border-b border-gray-200 focus:border-blue-500 focus:outline-none py-1"
                />
              </div>
              <div className="flex items-center">
                <PhoneIcon className="h-5 w-5 text-gray-400 mr-2" />
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Số điện thoại"
                  className="flex-1 text-sm border-b border-gray-200 focus:border-blue-500 focus:outline-none py-1"
                />
              </div>
              <div className="flex items-center">
                <InformationCircleIcon className="h-5 w-5 text-gray-400 mr-2" />
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú"
                  className="flex-1 text-sm border-b border-gray-200 focus:border-blue-500 focus:outline-none py-1"
                />
              </div>
            </div>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto">
            {invoiceItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4">
                <ShoppingCartIcon className="h-12 w-12 mb-3" />
                <p className="text-center">Giỏ hàng trống. Vui lòng chọn sản phẩm để thêm vào giỏ hàng.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {invoiceItems.map((item) => (
                  <li key={item.id} className="p-3 hover:bg-gray-50">
                    <div className="flex justify-between">
                      <div className="flex-1 pr-2">
                        <h3 className="font-medium text-gray-900">{item.productName}</h3>
                        <p className="text-sm text-gray-500">{item.unitName}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-blue-600 font-medium">
                          {item.amount.toLocaleString('vi-VN')} đ
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.unitPrice.toLocaleString('vi-VN')} đ/{item.unitName}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex justify-between items-center">
                      <div className="flex items-center">
                        <button
                          onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 0.1}
                          className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded-l-md text-gray-600 hover:bg-gray-100"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          max={item.maxQuantity}
                          value={item.quantity}
                          onChange={(e) => handleUpdateQuantity(item.id, parseFloat(e.target.value) || 0)}
                          className="w-12 h-7 border-t border-b border-gray-300 text-center text-sm focus:outline-none"
                        />
                        <button
                          onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                          disabled={item.quantity >= item.maxQuantity}
                          className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded-r-md text-gray-600 hover:bg-gray-100"
                        >
                          +
                        </button>
                        
                        <span className="ml-2 text-xs text-gray-500">
                          (Còn {item.maxQuantity})
                        </span>
                      </div>

                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Cart Summary */}
          <div className="border-t border-gray-200 p-4 bg-gray-50">
            <div className="flex justify-between mb-2">
              <span className="text-gray-600">Tổng tiền:</span>
              <span className="font-medium">{totalAmount.toLocaleString('vi-VN')} đ</span>
            </div>
            <div className="flex justify-between mb-3">
              <span className="text-gray-600">Chiết khấu:</span>
              <div className="flex items-center">
                <input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-20 p-1 border border-gray-300 rounded-md text-right text-sm"
                />
                <span className="ml-1">đ</span>
              </div>
            </div>
            <div className="flex justify-between text-lg font-bold text-blue-600 mb-4 py-2 border-t border-gray-200">
              <span>Thanh toán:</span>
              <span>{finalAmount.toLocaleString('vi-VN')} đ</span>
            </div>
            
            <button
              onClick={() => setShowPaymentModal(true)}
              disabled={invoiceItems.length === 0}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              <BanknotesIcon className="h-5 w-5 mr-2" />
              Thanh Toán
            </button>
          </div>
        </div>

        {/* Mobile Cart Slide-in */}
        <div 
          className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300 ${
            showCartMobile ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowCartMobile(false)}></div>
          <div 
            className={`absolute top-0 right-0 w-full max-w-xs h-full bg-white shadow-xl transform transition-transform duration-300 ${
              showCartMobile ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {/* Cart Header */}
            <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white flex justify-between items-center">
              <h2 className="text-lg font-bold">Giỏ hàng</h2>
              <button onClick={() => setShowCartMobile(false)} className="text-white">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            {/* Customer Info */}
            <div className="border-b border-gray-200">
              <div className="p-4 space-y-3">
                <div className="flex items-center">
                  <UserIcon className="h-5 w-5 text-gray-400 mr-2" />
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Tên khách hàng"
                    className="flex-1 text-sm border-b border-gray-200 focus:border-blue-500 focus:outline-none py-1"
                  />
                </div>
                <div className="flex items-center">
                  <PhoneIcon className="h-5 w-5 text-gray-400 mr-2" />
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Số điện thoại"
                    className="flex-1 text-sm border-b border-gray-200 focus:border-blue-500 focus:outline-none py-1"
                  />
                </div>
              </div>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto max-h-[calc(100vh-320px)]">
              {invoiceItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400 p-4">
                  <ShoppingCartIcon className="h-10 w-10 mb-2" />
                  <p className="text-center text-sm">Giỏ hàng trống</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {invoiceItems.map((item) => (
                    <li key={item.id} className="p-3">
                      <div className="flex justify-between">
                        <div className="flex-1 pr-2">
                          <h3 className="font-medium text-gray-900">{item.productName}</h3>
                          <p className="text-sm text-gray-500">{item.unitName}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-blue-600 font-medium">
                            {item.amount.toLocaleString('vi-VN')} đ
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 flex justify-between items-center">
                        <div className="flex items-center">
                          <button
                            onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                            disabled={item.quantity <= 0.1}
                            className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded-l-md text-gray-600"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            max={item.maxQuantity}
                            value={item.quantity}
                            onChange={(e) => handleUpdateQuantity(item.id, parseFloat(e.target.value) || 0)}
                            className="w-10 h-7 border-t border-b border-gray-300 text-center text-sm focus:outline-none"
                          />
                          <button
                            onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                            disabled={item.quantity >= item.maxQuantity}
                            className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded-r-md text-gray-600"
                          >
                            +
                          </button>
                        </div>

                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-red-500"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Cart Summary */}
            <div className="border-t border-gray-200 p-4 bg-gray-50">
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Tổng tiền:</span>
                <span className="font-medium">{totalAmount.toLocaleString('vi-VN')} đ</span>
              </div>
              <div className="flex justify-between mb-3">
                <span className="text-gray-600">Chiết khấu:</span>
                <div className="flex items-center">
                  <input
                    type="number"
                    min="0"
                    value={discount}
                    onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-20 p-1 border border-gray-300 rounded-md text-right text-sm"
                  />
                  <span className="ml-1">đ</span>
                </div>
              </div>
              <div className="flex justify-between text-lg font-bold text-blue-600 py-2 border-t border-gray-200">
                <span>Thanh toán:</span>
                <span>{finalAmount.toLocaleString('vi-VN')} đ</span>
              </div>
              
              <div className="flex space-x-2 mt-3">
                <button
                  onClick={handleClearCart}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                >
                  Làm mới
                </button>
                <button
                  onClick={() => {
                    setShowPaymentModal(true);
                    setShowCartMobile(false);
                  }}
                  disabled={invoiceItems.length === 0}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Thanh toán
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Modal */}
        {showPaymentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 z-10 bg-black bg-opacity-50" onClick={() => setShowPaymentModal(false)}>
            </div>
            <div className="bg-white z-50 rounded-xl max-w-md w-full shadow-xl">
              <Form method="post" onSubmit={handleSubmit} className="relative">
                <input type="hidden" name="_action" value="createInvoice" />
                <input type="hidden" name="invoiceCode" value={newInvoiceCode} />
                <input type="hidden" name="invoiceDate" value={currentDate} />
                <input type="hidden" name="customerName" value={customerName} />
                <input type="hidden" name="customerPhone" value={customerPhone} />
                <input type="hidden" name="notes" value={notes} />
                <input type="hidden" name="discount" value={discount} />
                <input type="hidden" name="totalAmount" value={totalAmount} />
                <input type="hidden" name="finalAmount" value={finalAmount} />

                <div className="flex justify-between items-center p-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold">Xác nhận thanh toán</h3>
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="p-4">
                  <div className="bg-gray-50 p-3 rounded-lg mb-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
                      <span className="text-sm text-gray-600">Mã hóa đơn: <span className="font-medium">{newInvoiceCode}</span></span>
                    </div>
                    {customerName && (
                      <div className="flex items-center space-x-2 mb-2">
                        <UserIcon className="h-5 w-5 text-gray-400" />
                        <span className="text-sm text-gray-600">Khách hàng: <span className="font-medium">{customerName}</span></span>
                      </div>
                    )}
                    {customerPhone && (
                      <div className="flex items-center space-x-2">
                        <PhoneIcon className="h-5 w-5 text-gray-400" />
                        <span className="text-sm text-gray-600">SĐT: <span className="font-medium">{customerPhone}</span></span>
                      </div>
                    )}
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-600">Tổng tiền hàng:</span>
                      <span>{totalAmount.toLocaleString('vi-VN')} đ</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-600">Chiết khấu:</span>
                      <span>{discount.toLocaleString('vi-VN')} đ</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold text-blue-600 pt-2 border-t">
                      <span>Thanh toán:</span>
                      <span>{finalAmount.toLocaleString('vi-VN')} đ</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phương thức thanh toán
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <label
                          className={`border rounded-lg p-3 flex flex-col items-center cursor-pointer transition ${
                            selectedMethod === "CASH" ? "border-green-500 bg-green-50" : "hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="paymentMethod"
                            value="CASH"
                            className="sr-only"
                            checked={selectedMethod === "CASH"}
                            onChange={() => setSelectedMethod("CASH")}
                          />
                          <BanknotesIcon className="h-6 w-6 text-green-500 mb-1" />
                          <span className="text-sm">Tiền mặt</span>
                        </label>

                        <label
                          className={`border rounded-lg p-3 flex flex-col items-center cursor-pointer transition ${
                            selectedMethod === "TRANSFER" ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="paymentMethod"
                            value="TRANSFER"
                            className="sr-only"
                            checked={selectedMethod === "TRANSFER"}
                            onChange={() => setSelectedMethod("TRANSFER")}
                          />
                          <ArrowDownTrayIcon className="h-6 w-6 text-blue-500 mb-1" />
                          <span className="text-sm">Chuyển khoản</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tiền khách đưa
                      </label>
                      <div className="relative">
                        <CurrencyDollarIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                        <input
                          type="number"
                          value={cashReceived}
                          onChange={(e) => setCashReceived(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      {cashReceived > 0 && (
                        <div className={`mt-2 text-sm ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {change >= 0 ? (
                            <>Tiền thừa: {change.toLocaleString('vi-VN')} đ</>
                          ) : (
                            <>Còn thiếu: {Math.abs(change).toLocaleString('vi-VN')} đ</>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowPaymentModal(false)}
                      className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 py-2 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 transition-colors flex items-center justify-center"
                    >
                      {isSubmitting ? (
                        'Đang xử lý...'
                      ) : (
                        <>
                          <CheckCircleIcon className="h-5 w-5 mr-1" />
                          Hoàn tất
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </Form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Missing icons for the code
function FireIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
    </svg>
  );
}

function ViewGridIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}
