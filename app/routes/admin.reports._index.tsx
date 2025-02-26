import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { db } from "~/utils/db.server";
import { useEffect, useState } from "react";
import { startOfMonth, endOfMonth, subMonths, format, parseISO, addDays } from "date-fns";
import { vi } from "date-fns/locale";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import { count } from "console";

// Custom color palette
const COLORS = {
  primary: '#3b82f6',
  primaryLight: '#93c5fd',
  secondary: '#f59e0b',
  secondaryLight: '#fcd34d',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f97316',
  info: '#06b6d4',
  purple: '#8b5cf6',
  pink: '#ec4899',
  chart: [
    '#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#6366f1', '#f43f5e', '#84cc16'
  ]
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  
  // Date range parameters
  const today = new Date();
  const defaultStartDate = format(startOfMonth(today), 'yyyy-MM-dd');
  const defaultEndDate = format(endOfMonth(today), 'yyyy-MM-dd');
  
  const startDate = url.searchParams.get("startDate") || defaultStartDate;
  const endDate = url.searchParams.get("endDate") || defaultEndDate;
  const reportType = url.searchParams.get("reportType") || "sales";
  const chartType = url.searchParams.get("chartType") || "line";
  const compareLastPeriod = url.searchParams.get("compare") === "true";
  
  // Parse dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999); // Set to end of day
  
  // For comparison period
  const periodDuration = end.getTime() - start.getTime();
  const comparisonStart = new Date(start.getTime() - periodDuration);
  const comparisonEnd = new Date(end.getTime() - periodDuration);
  
  // Fetch data based on report type
  let reportData: any = {};
  let comparisonData: any = {};
  let topProducts: any[] = [];
  let topCategories: any[] = [];
  let topStaff: any[] = [];
  
  // Summary stats
  const [salesStats, inventoryStats, expiringSoonCount] = await Promise.all([
    // Sales Statistics
    db.$transaction([
      // Total completed invoices
      db.invoice.count({
        where: { status: "COMPLETED", invoiceDate: { gte: start, lte: end } },
      }),
      
      // Total revenue
      db.invoice.aggregate({
        where: { status: "COMPLETED", invoiceDate: { gte: start, lte: end } },
        _sum: { finalAmount: true },
      }),
      
      // Total products sold
      db.invoiceItem.aggregate({
        where: { invoice: { status: "COMPLETED", invoiceDate: { gte: start, lte: end } } },
        _sum: { quantity: true },
      }),
      
      // Average invoice value
      db.invoice.aggregate({
        where: { status: "COMPLETED", invoiceDate: { gte: start, lte: end } },
        _avg: { finalAmount: true },
      }),
      
      // Comparison period stats (if requested)
      ...(compareLastPeriod ? [
        // Invoices in comparison period
        db.invoice.count({
          where: { status: "COMPLETED", invoiceDate: { gte: comparisonStart, lte: comparisonEnd } },
        }),
        
        // Revenue in comparison period
        db.invoice.aggregate({
          where: { status: "COMPLETED", invoiceDate: { gte: comparisonStart, lte: comparisonEnd } },
          _sum: { finalAmount: true },
        }),
        
        // Products sold in comparison period
        db.invoiceItem.aggregate({
          where: { invoice: { status: "COMPLETED", invoiceDate: { gte: comparisonStart, lte: comparisonEnd } } },
          _sum: { quantity: true },
        }),
      ] : []),
    ]),
    
    // Inventory Statistics
    db.$transaction([
      // Total products in inventory
      db.product.count(),
      
      // Total inventory value
      db.$queryRaw`
        SELECT SUM(i.quantity * pu.costPrice) as totalValue
        FROM Inventory i
        JOIN ProductUnit pu ON i.productUnitId = pu.id
        WHERE pu.isBaseUnit = true
      `,
      
      // Low stock products count (less than 10 units)
      db.$queryRaw`
        SELECT COUNT(DISTINCT p.id) as lowStockCount
        FROM Product p
        JOIN Inventory i ON p.id = i.productId
        JOIN ProductUnit pu ON i.productUnitId = pu.id
        WHERE pu.isBaseUnit = true AND i.quantity < 10
      `,
      
      // Out of stock products count
      db.$queryRaw`
        SELECT COUNT(p.id) as outOfStockCount
        FROM Product p
        LEFT JOIN Inventory i ON p.id = i.productId
        WHERE i.id IS NULL OR i.quantity = 0
      `,
    ]),
    
    // Expiring soon (within 90 days)
    db.inventory.count({
      where: {
        expiryDate: {
          gte: new Date(),
          lte: new Date(new Date().setDate(new Date().getDate() + 90)),
        },
      },
    }),
  ]);
  
  // Fetch report data based on type
  if (reportType === "sales") {
    // Get daily sales for the selected period
    const intervalQuery = compareLastPeriod
      ? `
        SELECT 
          DATE(invoiceDate) as date,
          CASE 
            WHEN invoiceDate >= ? AND invoiceDate <= ? THEN 'current'
            ELSE 'previous'
          END as period,
          COUNT(*) as count,
          SUM(finalAmount) as amount
        FROM Invoice
        WHERE 
          status = 'COMPLETED' 
          AND (
            (invoiceDate >= ? AND invoiceDate <= ?) OR
            (invoiceDate >= ? AND invoiceDate <= ?)
          )
        GROUP BY DATE(invoiceDate), period
        ORDER BY date
      `
      : `
        SELECT 
          DATE(invoiceDate) as date,
          COUNT(*) as count,
          SUM(finalAmount) as amount
        FROM Invoice
        WHERE 
          status = 'COMPLETED' 
          AND invoiceDate >= ? 
          AND invoiceDate <= ?
        GROUP BY DATE(invoiceDate)
        ORDER BY date
      `;
    
    const queryParams = compareLastPeriod
      ? [start, end, start, end, comparisonStart, comparisonEnd]
      : [start, end];
    
    const salesByInterval = (await db.$queryRaw(
      { sql: intervalQuery, values: queryParams }
    )).map((item: any) => ({
      date: item.date,
      count: Number(item.count),
      amount: item.amount,
    }));
    
    // Top 10 selling products
    topProducts = await db.$queryRaw`
      SELECT 
        p.id,
        p.name,
        p.code,
        SUM(ii.quantity) as totalQuantity,
        SUM(ii.amount) as totalAmount,
        c.name as categoryName
      FROM InvoiceItem ii
      JOIN Product p ON ii.productId = p.id
      JOIN Category c ON p.categoryId = c.id
      JOIN Invoice i ON ii.invoiceId = i.id
      WHERE 
        i.status = 'COMPLETED' 
        AND i.invoiceDate >= ${start} 
        AND i.invoiceDate <= ${end}
      GROUP BY p.id, p.name, p.code, c.name
      ORDER BY totalAmount DESC
      LIMIT 10
    `;
    
    // Top 5 categories
    topCategories = await db.$queryRaw`
      SELECT 
        c.id,
        c.name,
        COUNT(DISTINCT i.id) as invoiceCount,
        SUM(ii.amount) as totalAmount,
        SUM(ii.quantity) as totalQuantity
      FROM InvoiceItem ii
      JOIN Product p ON ii.productId = p.id
      JOIN Category c ON p.categoryId = c.id
      JOIN Invoice i ON ii.invoiceId = i.id
      WHERE 
        i.status = 'COMPLETED' 
        AND i.invoiceDate >= ${start} 
        AND i.invoiceDate <= ${end}
      GROUP BY c.id, c.name
      ORDER BY totalAmount DESC
      LIMIT 5
    `;
    
    // Top 5 staff by sales
    topStaff = await db.$queryRaw`
      SELECT 
        u.id,
        u.fullName,
        COUNT(i.id) as invoiceCount,
        SUM(i.finalAmount) as totalAmount,
        AVG(i.finalAmount) as avgAmount
      FROM Invoice i
      JOIN User u ON i.userId = u.id
      WHERE 
        i.status = 'COMPLETED' 
        AND i.invoiceDate >= ${start} 
        AND i.invoiceDate <= ${end}
      GROUP BY u.id, u.fullName
      ORDER BY totalAmount DESC
      LIMIT 5
    `;
    
    // Sales by hour of day for heatmap
    const salesByHour = await db.$queryRaw`
      SELECT 
        HOUR(invoiceDate) as hour,
        WEEKDAY(invoiceDate) as dayOfWeek,
        COUNT(*) as count,
        SUM(finalAmount) as amount
      FROM Invoice
      WHERE 
        status = 'COMPLETED' 
        AND invoiceDate >= ${start} 
        AND invoiceDate <= ${end}
      GROUP BY HOUR(invoiceDate), WEEKDAY(invoiceDate)
      ORDER BY dayOfWeek, hour
    `;
    
    reportData = {
      salesByInterval,
      salesByHour: salesByHour.map((item: any) => ({
        ...item,
        count: Number(item.count),
      })),
    };
  } else if (reportType === "inventory") {
    // Top products by inventory value
    topProducts = await db.$queryRaw`
      SELECT 
        p.id,
        p.name,
        p.code,
        SUM(i.quantity) as totalQuantity,
        SUM(i.quantity * pu.costPrice) as totalValue,
        c.name as categoryName
      FROM Inventory i
      JOIN Product p ON i.productId = p.id
      JOIN ProductUnit pu ON i.productUnitId = pu.id
      JOIN Category c ON p.categoryId = c.id
      GROUP BY p.id, p.name, p.code, c.name
      ORDER BY totalValue DESC
      LIMIT 10
    `;
    
    // Expiring products by month
    const expiringProducts = await db.$queryRaw`
      SELECT
        DATE_FORMAT(expiryDate, '%Y-%m') as monthYear,
        COUNT(*) as count,
        SUM(i.quantity * pu.costPrice) as totalValue
      FROM Inventory i
      JOIN ProductUnit pu ON i.productUnitId = pu.id
      WHERE 
        i.expiryDate IS NOT NULL
        AND i.expiryDate >= CURDATE()
        AND i.expiryDate <= DATE_ADD(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(expiryDate, '%Y-%m')
      ORDER BY monthYear
    `;
    
    // Low stock products
    const lowStockProducts = await db.$queryRaw`
      SELECT 
        p.id,
        p.name,
        p.code,
        i.quantity,
        u.name as unitName,
        c.name as categoryName,
        pu.costPrice,
        (i.quantity * pu.costPrice) as totalValue
      FROM Inventory i
      JOIN Product p ON i.productId = p.id
      JOIN ProductUnit pu ON i.productUnitId = pu.id
      JOIN Unit u ON pu.unitId = u.id
      JOIN Category c ON p.categoryId = c.id
      WHERE 
        pu.isBaseUnit = true
        AND i.quantity < 10
      ORDER BY i.quantity
      LIMIT 20
    `;
    
    // Inventory by category
    topCategories = await db.$queryRaw`
      SELECT 
        c.id,
        c.name,
        COUNT(DISTINCT p.id) as productCount,
        SUM(i.quantity * pu.costPrice) as totalValue
      FROM Inventory i
      JOIN Product p ON i.productId = p.id
      JOIN ProductUnit pu ON i.productUnitId = pu.id
      JOIN Category c ON p.categoryId = c.id
      GROUP BY c.id, c.name
      ORDER BY totalValue DESC
      LIMIT 5
    `;
    
    // Inventory turnover by product (current month vs previous month)
    const inventoryTurnover = await db.$queryRaw`
      SELECT 
        p.id,
        p.name,
        p.code,
        c.name as categoryName,
        SUM(CASE 
          WHEN i.invoiceDate >= ${start} AND i.invoiceDate <= ${end} 
          THEN ii.quantity
          ELSE 0
        END) as currentSales,
        SUM(CASE 
          WHEN i.invoiceDate >= ${comparisonStart} AND i.invoiceDate <= ${comparisonEnd}
          THEN ii.quantity
          ELSE 0
        END) as previousSales,
        inv.quantity as currentStock
      FROM Product p
      JOIN Category c ON p.categoryId = c.id
      LEFT JOIN InvoiceItem ii ON p.id = ii.productId
      LEFT JOIN Invoice i ON ii.invoiceId = i.id AND i.status = 'COMPLETED'
      LEFT JOIN (
        SELECT 
          productId, 
          SUM(quantity) as quantity
        FROM Inventory
        GROUP BY productId
      ) inv ON p.id = inv.productId
      GROUP BY p.id, p.name, p.code, c.name, inv.quantity
      HAVING currentSales > 0 OR previousSales > 0
      ORDER BY currentSales DESC
      LIMIT 10
    `;
    
    reportData = {
      expiringProducts: expiringProducts.map((item: any) => ({
        ...item,
        count: Number(item.count)
      })),
      lowStockProducts,
      inventoryTurnover
    };
  } else if (reportType === "purchases") {
    // Monthly purchase data
    const monthlyPurchases = await db.$queryRaw`
      SELECT 
        DATE_FORMAT(orderDate, '%Y-%m') as monthYear,
        COUNT(*) as count,
        SUM(totalAmount) as amount
      FROM PurchaseOrder
      WHERE 
        orderDate >= DATE_SUB(${start}, INTERVAL 12 MONTH)
        AND orderDate <= ${end}
      GROUP BY DATE_FORMAT(orderDate, '%Y-%m')
      ORDER BY monthYear
    `;
    
    // Top 10 purchased products
    topProducts = await db.$queryRaw`
      SELECT 
        p.id,
        p.name,
        p.code,
        SUM(poi.quantity) as totalQuantity,
        SUM(poi.quantity * poi.costPrice) as totalAmount,
        c.name as categoryName
      FROM PurchaseOrderItem poi
      JOIN Product p ON poi.productId = p.id
      JOIN Category c ON p.categoryId = c.id
      JOIN PurchaseOrder po ON poi.purchaseOrderId = po.id
      WHERE 
        po.orderDate >= ${start}
        AND po.orderDate <= ${end}
      GROUP BY p.id, p.name, p.code, c.name
      ORDER BY totalAmount DESC
      LIMIT 10
    `;
    
    // Top 5 suppliers
    const topSuppliers = await db.$queryRaw`
      SELECT 
        s.id,
        s.name,
        COUNT(po.id) as orderCount,
        SUM(po.totalAmount) as totalAmount,
        AVG(po.totalAmount) as avgOrderValue
      FROM PurchaseOrder po
      JOIN Supplier s ON po.supplierId = s.id
      WHERE 
        po.orderDate >= ${start}
        AND po.orderDate <= ${end}
      GROUP BY s.id, s.name
      ORDER BY totalAmount DESC
      LIMIT 5
    `;
    
    // Purchase status distribution
    const purchaseStatusDistribution = await db.$queryRaw`
      SELECT 
        paymentStatus,
        COUNT(*) as count,
        SUM(totalAmount) as amount
      FROM PurchaseOrder
      WHERE 
        orderDate >= ${start}
        AND orderDate <= ${end}
      GROUP BY paymentStatus
    `;
    
    // Compare current period with previous period
    if (compareLastPeriod) {
      const previousPurchaseStats = await db.$queryRaw`
        SELECT 
          COUNT(*) as orderCount,
          SUM(totalAmount) as totalAmount
        FROM PurchaseOrder
        WHERE 
          orderDate >= ${comparisonStart}
          AND orderDate <= ${comparisonEnd}
      `;
      
      comparisonData = {
        previousPurchaseStats: previousPurchaseStats[0]
      };
    }
    
    reportData = {
      monthlyPurchases: monthlyPurchases.map((purchase: any) => ({
        ...purchase,
        count: Number(purchase.count)
      })),
      topSuppliers: topSuppliers.map((supplier: any) => ({
        ...supplier,
        orderCount: Number(supplier.order)
      })),
      purchaseStatusDistribution: purchaseStatusDistribution.map((status: any) => ({
        ...status,
        count: Number(status.count)
      }))
    };
  }
  
  // Get months for dropdown (last 12 months)
  const availableMonths = Array.from({ length: 12 }, (_, i) => {
    const month = subMonths(today, i);
    return {
      value: format(month, 'yyyy-MM'),
      label: format(month, 'MMMM yyyy', { locale: vi }),
      startDate: format(startOfMonth(month), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(month), 'yyyy-MM-dd'),
    };
  });
  
  // Add predefined periods
  const predefinedPeriods = [
    {
      label: 'Hôm nay',
      startDate: format(today, 'yyyy-MM-dd'),
      endDate: format(today, 'yyyy-MM-dd'),
    },
    {
      label: 'Tuần này',
      startDate: format(addDays(today, -today.getDay()), 'yyyy-MM-dd'),
      endDate: format(today, 'yyyy-MM-dd'),
    },
    {
      label: '7 ngày qua',
      startDate: format(addDays(today, -6), 'yyyy-MM-dd'),
      endDate: format(today, 'yyyy-MM-dd'),
    },
    {
      label: '30 ngày qua',
      startDate: format(addDays(today, -29), 'yyyy-MM-dd'),
      endDate: format(today, 'yyyy-MM-dd'),
    },
    {
      label: '90 ngày qua',
      startDate: format(addDays(today, -89), 'yyyy-MM-dd'),
      endDate: format(today, 'yyyy-MM-dd'),
    },
    {
      label: 'Năm nay',
      startDate: `${today.getFullYear()}-01-01`,
      endDate: format(today, 'yyyy-MM-dd'),
    }
  ];
  return json({
    reportType,
    startDate,
    endDate,
    chartType,
    compareLastPeriod,
    availableMonths,
    predefinedPeriods,
    salesStats: {
      invoiceCount: salesStats[0],
      totalRevenue: salesStats[1]._sum.finalAmount || 0,
      totalQuantitySold: salesStats[2]._sum.quantity || 0,
      averageInvoiceValue: salesStats[3]._avg.finalAmount || 0,
      comparisonData: compareLastPeriod ? {
        previousInvoiceCount: salesStats[4] || 0,
        previousRevenue: salesStats[5]?._sum.finalAmount || 0,
        previousQuantitySold: salesStats[6]?._sum.quantity || 0,
      } : null,
    },
    inventoryStats: {
      totalProducts: inventoryStats[0],
      totalValue: inventoryStats[1]?.[0]?.totalValue || 0,
      lowStockCount: Number(inventoryStats[2]?.[0]?.lowStockCount) || 0,
      outOfStockCount: Number(inventoryStats[3]?.[0]?.outOfStockCount) || 0,
      expiringSoonCount,
    },
    reportData,
    comparisonData,
    topProducts,
    topCategories: topCategories.map((category: any) => ({
      ...category,
      invoiceCount: Number(category.invoiceCount),
      productCount: Number(category.productCount),
    })),
    topStaff: topStaff.map((top: any) => ({
      ...top,
      invoiceCount: Number(top.invoiceCount),
    }
    )),
  });
};

export default function ImprovedReportsDashboard() {
  const {
    reportType,
    startDate,
    endDate,
    chartType,
    compareLastPeriod,
    availableMonths,
    predefinedPeriods,
    salesStats,
    inventoryStats,
    reportData,
    comparisonData,
    topProducts,
    topCategories,
    topStaff,
  } = useLoaderData<typeof loader>();
  
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State for charts
  const [chartData, setChartData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("custom");
  
  // Format number as currency
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("vi-VN") + " đ";
  };
  
  // Format date for display
  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd/MM/yyyy');
  };
  
  // Format number with thousands separator
  const formatNumber = (num: number) => {
    return num.toLocaleString("vi-VN");
  };
  
  // Calculate percentage change
  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return 100;
    return ((current - previous) / previous) * 100;
  };
  
  // Apply period filter
  const applyPeriodFilter = (periodKey: string) => {
    // Handle custom period separately
    if (periodKey === "custom") {
      setSelectedPeriod("custom");
      return;
    }
    
    // Find the selected period
    const period = [...predefinedPeriods, ...availableMonths].find(p => 
      p.startDate + "-" + p.endDate === periodKey
    );
    
    if (period) {
      setSelectedPeriod(periodKey);
      
      // Update search params
      searchParams.set("startDate", period.startDate);
      searchParams.set("endDate", period.endDate);
      setSearchParams(searchParams);
    }
  };
  
  // Process chart data on load
  useEffect(() => {
    // Determine the selected period
    const currentPeriodKey = startDate + "-" + endDate;
    const matchingPeriod = [...predefinedPeriods, ...availableMonths].find(p => 
      p.startDate === startDate && p.endDate === endDate
    );
    
    if (matchingPeriod) {
      setSelectedPeriod(currentPeriodKey);
    } else {
      setSelectedPeriod("custom");
    }
    
    if (reportType === "sales") {
      // Format daily sales data for charts
      if (reportData.salesByInterval) {
        if (compareLastPeriod) {
          // Organize data for comparison chart
          const salesByDate: Record<string, any> = {};
          
          reportData.salesByInterval.forEach((item: any) => {
            const dateStr = format(new Date(item.date), 'yyyy-MM-dd');
            if (!salesByDate[dateStr]) {
              salesByDate[dateStr] = { date: format(new Date(dateStr), 'dd/MM') };
            }
            
            if (item.period === 'current') {
              salesByDate[dateStr].currentAmount = Number(item.amount);
              salesByDate[dateStr].currentCount = Number(item.count);
            } else {
              salesByDate[dateStr].previousAmount = Number(item.amount);
              salesByDate[dateStr].previousCount = Number(item.count);
            }
          });
          
          setChartData(Object.values(salesByDate));
        } else {
          // Standard chart data
          setChartData(
            reportData.salesByInterval.map((sale: any) => ({
              date: format(new Date(sale.date), 'dd/MM'),
              value: Number(sale.amount),
              count: Number(sale.count),
            }))
          );
        }
        
        // Process heatmap data (sales by hour and day of week)
        if (reportData.salesByHour) {
          const processedHeatmapData = [];
          const dayNames = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
          
          for (let day = 0; day < 7; day++) {
            for (let hour = 0; hour < 24; hour++) {
              const hourData = reportData.salesByHour.find((item: any) => 
                item.dayOfWeek === day && item.hour === hour
              );
              
              processedHeatmapData.push({
                dayOfWeek: day,
                dayName: dayNames[day],
                hour: hour,
                hourFormatted: `${hour}:00`,
                count: hourData ? Number(hourData.count) : 0,
                amount: hourData ? Number(hourData.amount) : 0,
              });
            }
          }
          
          setHeatmapData(processedHeatmapData);
        }
      }
      
      // Create pie chart data from categories
      if (topCategories && topCategories.length > 0) {
        setPieData(
          topCategories.map((category: any, index: number) => ({
            name: category.name,
            value: Number(category.totalAmount),
            color: COLORS.chart[index % COLORS.chart.length]
          }))
        );
      }
    } else if (reportType === "inventory") {
      // Process expiring products data for chart
      if (reportData.expiringProducts) {
        setChartData(
          reportData.expiringProducts.map((item: any) => ({
            date: format(new Date(item.monthYear + '-01'), 'MM/yyyy'),
            value: Number(item.totalValue),
            count: Number(item.count),
          }))
        );
      }
      
      // Process inventory turnover data
      if (reportData.inventoryTurnover) {
        const turnoverData = reportData.inventoryTurnover.map((item: any) => ({
          name: item.name,
          code: item.code,
          category: item.categoryName,
          current: Number(item.currentSales),
          previous: Number(item.previousSales),
          stock: Number(item.currentStock) || 0,
          change: calculateChange(Number(item.currentSales), Number(item.previousSales)),
        }));
        
        setChartData(turnoverData);
      }
      
      // Create pie chart data from categories
      if (topCategories && topCategories.length > 0) {
        setPieData(
          topCategories.map((category: any, index: number) => ({
            name: category.name,
            value: Number(category.totalValue),
            color: COLORS.chart[index % COLORS.chart.length]
          }))
        );
      }
    } else if (reportType === "purchases") {
      // Process monthly purchases data
      if (reportData.monthlyPurchases) {
        setChartData(
          reportData.monthlyPurchases.map((purchase: any) => ({
            date: format(new Date(purchase.monthYear + '-01'), 'MM/yyyy'),
            value: Number(purchase.amount),
            count: Number(purchase.count),
          }))
        );
      }
      
      // Process payment status data for pie chart
      if (reportData.purchaseStatusDistribution) {
        setPieData(
          reportData.purchaseStatusDistribution.map((status: any, index: number) => {
            let statusName = '';
            let statusColor = '';
            
            switch (status.paymentStatus) {
              case 'PAID':
                statusName = 'Đã thanh toán';
                statusColor = COLORS.success;
                break;
              case 'PARTIAL':
                statusName = 'Thanh toán một phần';
                statusColor = COLORS.warning;
                break;
              case 'UNPAID':
                statusName = 'Chưa thanh toán';
                statusColor = COLORS.danger;
                break;
              default:
                statusName = status.paymentStatus;
                statusColor = COLORS.chart[index % COLORS.chart.length];
            }
            
            return {
              name: statusName,
              value: Number(status.amount),
              count: Number(status.count),
              color: statusColor
            };
          })
        );
      }
    }
  }, [reportType, reportData, topCategories, compareLastPeriod, startDate, endDate, predefinedPeriods, availableMonths]);
  
  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-md">
          <p className="text-gray-600 font-medium">{label}</p>
          
          {payload.map((entry: any, index: number) => {
            if (entry.value === 0) return null;
            
            let name = '';
            let color = '';
            
            // Determine entry name and color
            if (entry.dataKey === 'value') {
              name = reportType === "sales" 
                ? "Doanh thu" 
                : reportType === "inventory" 
                  ? "Giá trị" 
                  : "Nhập hàng";
              color = COLORS.primary;
            } else if (entry.dataKey === 'count') {
              name = "Số lượng";
              color = COLORS.secondary;
            } else if (entry.dataKey === 'currentAmount') {
              name = "Doanh thu (hiện tại)";
              color = COLORS.primary;
            } else if (entry.dataKey === 'previousAmount') {
              name = "Doanh thu (trước đó)";
              color = COLORS.secondaryLight;
            } else if (entry.dataKey === 'current') {
              name = "Hiện tại";
              color = COLORS.primary;
            } else if (entry.dataKey === 'previous') {
              name = "Trước đó";
              color = COLORS.secondaryLight;
            }
            
            return (
              <div key={index} style={{ color: color || entry.color || '#000' }}>
                <span className="font-medium">{name || entry.name || entry.dataKey}: </span>
                <span className="font-bold">
                  {entry.dataKey.includes('mount') || entry.dataKey === 'value' 
                    ? formatCurrency(entry.value) 
                    : formatNumber(entry.value)}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };
  
  return (
    <div className="p-4 lg:p-6 bg-gray-50 min-h-screen">
      {/* Header and filters */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Báo cáo thống kê</h1>
          <p className="text-gray-500">
            {formatDate(startDate)} - {formatDate(endDate)}
          </p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-3 w-full lg:w-auto">
          {/* Report type selector */}
          <div className="w-full md:w-auto">
            <select
              className="w-full md:min-w-[200px] px-3 py-2 border border-gray-300 rounded-md bg-white"
              value={reportType}
              onChange={(e) => {
                searchParams.set("reportType", e.target.value);
                setSearchParams(searchParams);
              }}
            >
              <option value="sales">Báo cáo bán hàng</option>
              <option value="inventory">Báo cáo tồn kho</option>
              <option value="purchases">Báo cáo nhập hàng</option>
            </select>
          </div>
          
          {/* Predefined periods */}
          <div className="w-full md:w-auto">
            <select
              className="w-full md:min-w-[200px] px-3 py-2 border border-gray-300 rounded-md bg-white"
              value={selectedPeriod}
              onChange={(e) => applyPeriodFilter(e.target.value)}
            >
              <option value="custom">Tùy chỉnh</option>
              <optgroup label="Khoảng thời gian">
                {predefinedPeriods.map((period) => (
                  <option key={period.label} value={`${period.startDate}-${period.endDate}`}>
                    {period.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Tháng">
                {availableMonths.map((month) => (
                  <option key={month.value} value={`${month.startDate}-${month.endDate}`}>
                    {month.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          
          {/* Chart type selector */}
          <div className="w-full md:w-auto">
            <select
              className="w-full md:min-w-[150px] px-3 py-2 border border-gray-300 rounded-md bg-white"
              value={chartType}
              onChange={(e) => {
                searchParams.set("chartType", e.target.value);
                setSearchParams(searchParams);
              }}
            >
              <option value="line">Biểu đồ đường</option>
              <option value="bar">Biểu đồ cột</option>
              <option value="area">Biểu đồ vùng</option>
            </select>
          </div>
          
          {/* Compare checkbox */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="compare"
              className="mr-2 h-4 w-4 text-blue-600"
              checked={compareLastPeriod}
              onChange={(e) => {
                searchParams.set("compare", e.target.checked ? "true" : "false");
                setSearchParams(searchParams);
              }}
            />
            <label htmlFor="compare" className="text-gray-700">So sánh</label>
          </div>
        </div>
      </div>
      
      {/* Custom date range picker */}
      {selectedPeriod === "custom" && (
        <div className="flex flex-col sm:flex-row gap-3 mb-6 p-4 bg-white rounded-lg shadow">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">Từ ngày</label>
            <input
              type="date"
              className="border border-gray-300 rounded-md px-3 py-2"
              value={startDate}
              onChange={(e) => {
                searchParams.set("startDate", e.target.value);
                setSearchParams(searchParams);
              }}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">Đến ngày</label>
            <input
              type="date"
              className="border border-gray-300 rounded-md px-3 py-2"
              value={endDate}
              onChange={(e) => {
                searchParams.set("endDate", e.target.value);
                setSearchParams(searchParams);
              }}
            />
          </div>
          <div className="self-end mt-1">
            <button
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md"
              onClick={() => {
                // Update URL with current filters
                setSearchParams(searchParams);
              }}
            >
              Áp dụng
            </button>
          </div>
        </div>
      )}
      
      {/* Main content based on report type */}
      {reportType === "sales" && (
        <>
          {/* Sales overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Tổng doanh thu</p>
                  <h3 className="text-xl font-bold text-gray-800 mt-1">{formatCurrency(salesStats.totalRevenue)}</h3>
                </div>
                <div className="p-2 bg-blue-100 rounded-md text-blue-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              {compareLastPeriod && salesStats.comparisonData && (
                <div className="mt-2">
                  <div className={`text-sm ${salesStats.totalRevenue > salesStats.comparisonData.previousRevenue ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                    {salesStats.totalRevenue > salesStats.comparisonData.previousRevenue ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                    {Math.abs(calculateChange(salesStats.totalRevenue, salesStats.comparisonData.previousRevenue)).toFixed(1)}%
                  </div>
                  <p className="text-xs text-gray-500">So với kỳ trước: {formatCurrency(salesStats.comparisonData.previousRevenue)}</p>
                </div>
              )}
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Số đơn hàng</p>
                  <h3 className="text-xl font-bold text-gray-800 mt-1">{formatNumber(salesStats.invoiceCount)}</h3>
                </div>
                <div className="p-2 bg-green-100 rounded-md text-green-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
              </div>
              {compareLastPeriod && salesStats.comparisonData && (
                <div className="mt-2">
                  <div className={`text-sm ${salesStats.invoiceCount > salesStats.comparisonData.previousInvoiceCount ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                    {salesStats.invoiceCount > salesStats.comparisonData.previousInvoiceCount ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                    {Math.abs(calculateChange(salesStats.invoiceCount, salesStats.comparisonData.previousInvoiceCount)).toFixed(1)}%
                  </div>
                  <p className="text-xs text-gray-500">So với kỳ trước: {formatNumber(salesStats.comparisonData.previousInvoiceCount)}</p>
                </div>
              )}
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Giá trị trung bình</p>
                  <h3 className="text-xl font-bold text-gray-800 mt-1">{formatCurrency(salesStats.averageInvoiceValue)}</h3>
                </div>
                <div className="p-2 bg-purple-100 rounded-md text-purple-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
              {compareLastPeriod && salesStats.comparisonData && (
                <div className="mt-2">
                  <div className={`text-sm ${(salesStats.totalRevenue / salesStats.invoiceCount) > (salesStats.comparisonData.previousRevenue / salesStats.comparisonData.previousInvoiceCount) ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                    {(salesStats.totalRevenue / salesStats.invoiceCount) > (salesStats.comparisonData.previousRevenue / salesStats.comparisonData.previousInvoiceCount) ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                    {Math.abs(calculateChange(
                      salesStats.totalRevenue / salesStats.invoiceCount, 
                      salesStats.comparisonData.previousRevenue / salesStats.comparisonData.previousInvoiceCount
                    )).toFixed(1)}%
                  </div>
                  <p className="text-xs text-gray-500">So với kỳ trước</p>
                </div>
              )}
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Tổng số lượng sản phẩm</p>
                  <h3 className="text-xl font-bold text-gray-800 mt-1">{formatNumber(salesStats.totalQuantitySold)}</h3>
                </div>
                <div className="p-2 bg-yellow-100 rounded-md text-yellow-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              </div>
              {compareLastPeriod && salesStats.comparisonData && (
                <div className="mt-2">
                  <div className={`text-sm ${salesStats.totalQuantitySold > salesStats.comparisonData.previousQuantitySold ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                    {salesStats.totalQuantitySold > salesStats.comparisonData.previousQuantitySold ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                    {Math.abs(calculateChange(salesStats.totalQuantitySold, salesStats.comparisonData.previousQuantitySold)).toFixed(1)}%
                  </div>
                  <p className="text-xs text-gray-500">So với kỳ trước: {formatNumber(salesStats.comparisonData.previousQuantitySold)}</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Main sales chart */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Doanh thu theo thời gian</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'line' ? (
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    {compareLastPeriod ? (
                      <>
                        <Line type="monotone" dataKey="currentAmount" stroke={COLORS.primary} strokeWidth={2} activeDot={{ r: 8 }} name="Doanh thu (hiện tại)" />
                        <Line type="monotone" dataKey="previousAmount" stroke={COLORS.secondaryLight} strokeWidth={2} strokeDasharray="5 5" name="Doanh thu (trước đó)" />
                      </>
                    ) : (
                      <Line type="monotone" dataKey="value" stroke={COLORS.primary} strokeWidth={2} activeDot={{ r: 8 }} name="Doanh thu" />
                    )}
                  </LineChart>
                ) : chartType === 'bar' ? (
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    {compareLastPeriod ? (
                      <>
                        <Bar dataKey="currentAmount" fill={COLORS.primary} name="Doanh thu (hiện tại)" />
                        <Bar dataKey="previousAmount" fill={COLORS.secondaryLight} name="Doanh thu (trước đó)" />
                      </>
                    ) : (
                      <Bar dataKey="value" fill={COLORS.primary} name="Doanh thu" />
                    )}
                  </BarChart>
                ) : (
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    {compareLastPeriod ? (
                      <>
                        <Area type="monotone" dataKey="currentAmount" stroke={COLORS.primary} fill={COLORS.primaryLight} name="Doanh thu (hiện tại)" />
                        <Area type="monotone" dataKey="previousAmount" stroke={COLORS.secondary} fill={COLORS.secondaryLight} name="Doanh thu (trước đó)" />
                      </>
                    ) : (
                      <Area type="monotone" dataKey="value" stroke={COLORS.primary} fill={COLORS.primaryLight} name="Doanh thu" />
                    )}
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Category and top products */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Doanh thu theo danh mục</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || COLORS.chart[index % COLORS.chart.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Top 5 sản phẩm bán chạy</h2>
              <div className="h-72 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Sản phẩm
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Số lượng
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Doanh thu
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {topProducts.map((product: any, index: number) => (
                      <tr key={product.id}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center text-xs font-medium text-white bg-blue-500 rounded-full">
                              {index + 1}
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-gray-900">{product.name}</div>
                              <div className="text-xs text-gray-500">{product.code} - {product.categoryName}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500">
                          {formatNumber(Number(product.totalQuantity))}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                          {formatCurrency(Number(product.totalAmount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          {/* Staff performance and heatmap */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Hiệu suất nhân viên</h2>
              <div className="h-72 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nhân viên
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Số đơn
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Doanh thu
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        TB/Đơn
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {topStaff.map((staff: any, index: number) => (
                      <tr key={staff.id}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center text-xs font-medium text-white bg-green-500 rounded-full">
                              {index + 1}
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-gray-900">{staff.fullName}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500">
                          {formatNumber(Number(staff.invoiceCount))}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                          {formatCurrency(Number(staff.totalAmount))}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-500">
                          {formatCurrency(Number(staff.avgAmount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Doanh thu theo giờ</h2>
              <div className="h-72 overflow-auto">
                <div className="min-h-full min-w-full grid grid-cols-12 gap-1">
                  {/* Row headers (hours) */}
                  <div className="col-span-1">
                    {Array.from({ length: 24 }).map((_, hour) => (
                      <div key={hour} className="h-6 flex items-center justify-end pr-2 text-xs text-gray-500">
                        {hour}:00
                      </div>
                    ))}
                  </div>
                  
                  {/* Heatmap cells */}
                  <div className="col-span-11 grid grid-cols-7 gap-1">
                    {/* Column headers (days) */}
                    {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day, index) => (
                      <div key={index} className="text-xs font-medium text-gray-500 mb-1 text-center">
                        {day}
                      </div>
                    ))}
                    
                    {/* Heatmap cells */}
                    {heatmapData.map((cell, index) => {
                      // Calculate color intensity based on count
                      const maxCount = Math.max(...heatmapData.map(d => d.count));
                      const intensity = cell.count > 0 ? (cell.count / maxCount) * 0.85 + 0.15 : 0
                      
                      const bgColor = `rgba(59, 130, 246, ${intensity})`;
                      
                      return (
                        <div 
                          key={index}
                          className="h-6 rounded flex items-center justify-center text-xs relative group"
                          style={{ backgroundColor: bgColor }}
                        >
                          {cell.count > 0 && (
                            <div className="hidden group-hover:block absolute bottom-full left-1/2 transform -translate-x-1/2 p-2 bg-gray-800 text-white rounded text-xs whitespace-nowrap z-10">
                              {cell.dayName} {cell.hourFormatted}: {formatNumber(cell.count)} đơn<br />
                              Doanh thu: {formatCurrency(cell.amount)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      
      {reportType === "inventory" && (
        <>
          {/* Inventory overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Tổng số sản phẩm</p>
                  <h3 className="text-xl font-bold text-gray-800 mt-1">{formatNumber(inventoryStats.totalProducts)}</h3>
                </div>
                <div className="p-2 bg-blue-100 rounded-md text-blue-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Giá trị tồn kho</p>
                  <h3 className="text-xl font-bold text-gray-800 mt-1">{formatCurrency(inventoryStats.totalValue)}</h3>
                </div>
                <div className="p-2 bg-green-100 rounded-md text-green-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Hàng sắp hết</p>
                  <h3 className="text-xl font-bold text-gray-800 mt-1">{formatNumber(inventoryStats.lowStockCount)}</h3>
                </div>
                <div className="p-2 bg-yellow-100 rounded-md text-yellow-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Hết hàng</p>
                  <h3 className="text-xl font-bold text-gray-800 mt-1">{formatNumber(inventoryStats.outOfStockCount)}</h3>
                </div>
                <div className="p-2 bg-red-100 rounded-md text-red-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Sắp hết hạn</p>
                  <h3 className="text-xl font-bold text-gray-800 mt-1">{formatNumber(inventoryStats.expiringSoonCount)}</h3>
                </div>
                <div className="p-2 bg-purple-100 rounded-md text-purple-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          
          {/* Expiring products chart */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Giá trị hàng hóa sắp hết hạn (12 tháng tới)</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'line' ? (
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="value" stroke={COLORS.primary} strokeWidth={2} activeDot={{ r: 8 }} name="Giá trị sắp hết hạn" />
                    <Line type="monotone" dataKey="count" stroke={COLORS.secondary} strokeWidth={2} activeDot={{ r: 6 }} name="Số lượng" />
                  </LineChart>
                ) : chartType === 'bar' ? (
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" orientation="left" stroke={COLORS.primary} />
                    <YAxis yAxisId="right" orientation="right" stroke={COLORS.secondary} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="value" fill={COLORS.primary} name="Giá trị sắp hết hạn" />
                    <Bar yAxisId="right" dataKey="count" fill={COLORS.secondary} name="Số lượng" />
                  </BarChart>
                ) : (
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area type="monotone" dataKey="value" stroke={COLORS.primary} fill={COLORS.primaryLight} name="Giá trị sắp hết hạn" />
                    <Area type="monotone" dataKey="count" stroke={COLORS.secondary} fill={COLORS.secondaryLight} name="Số lượng" />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Inventory by category and inventory value */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Giá trị tồn kho theo danh mục</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || COLORS.chart[index % COLORS.chart.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Top 10 sản phẩm có giá trị tồn kho cao nhất</h2>
              <div className="h-72 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Sản phẩm
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Số lượng
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Giá trị
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {topProducts.map((product: any, index: number) => (
                      <tr key={product.id}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center text-xs font-medium text-white bg-blue-500 rounded-full">
                              {index + 1}
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-gray-900">{product.name}</div>
                              <div className="text-xs text-gray-500">{product.code} - {product.categoryName}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500">
                          {formatNumber(Number(product.totalQuantity))}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                          {formatCurrency(Number(product.totalValue))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          {/* Low stock and product turnover */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Sản phẩm sắp hết hàng</h2>
              <div className="h-96 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Sản phẩm
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tồn kho
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Đơn vị
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Giá trị
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reportData.lowStockProducts && reportData.lowStockProducts.map((product: any) => (
                      <tr key={product.id}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className={`flex-shrink-0 h-8 w-8 flex items-center justify-center text-xs font-medium text-white rounded-full ${product.quantity <= 3 ? 'bg-red-500' : 'bg-yellow-500'}`}>
                              {product.quantity}
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-gray-900">{product.name}</div>
                              <div className="text-xs text-gray-500">{product.code} - {product.categoryName}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div className={`h-2.5 rounded-full ${product.quantity <= 3 ? 'bg-red-500' : 'bg-yellow-500'}`} style={{ width: `${Math.min(100, product.quantity * 10)}%` }}></div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500">
                          {product.unitName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                          {formatCurrency(Number(product.totalValue))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Phân tích vòng quay hàng</h2>
              <div className="h-96 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Sản phẩm
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Bán ra kỳ này
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Bán ra kỳ trước
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tồn kho
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        % Thay đổi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reportData.inventoryTurnover && reportData.inventoryTurnover.map((product: any) => (
                      <tr key={product.id}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{product.name}</div>
                          <div className="text-xs text-gray-500">{product.code} - {product.categoryName}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                          {formatNumber(Number(product.currentSales))}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500">
                          {formatNumber(Number(product.previousSales))}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500">
                          {formatNumber(Number(product.currentStock))}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            Number(product.currentSales) > Number(product.previousSales) 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {Number(product.currentSales) > Number(product.previousSales) ? '+' : ''}
                            {calculateChange(Number(product.currentSales), Number(product.previousSales)).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
      
      {reportType === "purchases" && (
        <>
          {/* Purchases overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Tổng nhập hàng</p>
                  <h3 className="text-xl font-bold text-gray-800 mt-1">
                    {reportData.monthlyPurchases ? formatCurrency(
                      reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.amount), 0)
                    ) : "0 đ"}
                  </h3>
                </div>
                <div className="p-2 bg-blue-100 rounded-md text-blue-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              </div>
              {compareLastPeriod && comparisonData.previousPurchaseStats && (
                <div className="mt-2">
                  <div className={`text-sm flex items-center ${
                    reportData.monthlyPurchases && 
                    reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.amount), 0) > 
                    Number(comparisonData.previousPurchaseStats.totalAmount) 
                      ? 'text-green-600' 
                      : 'text-red-600'
                  }`}>
                    {reportData.monthlyPurchases && 
                      reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.amount), 0) > 
                      Number(comparisonData.previousPurchaseStats.totalAmount) ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                    {reportData.monthlyPurchases && Math.abs(calculateChange(
                      reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.amount), 0),
                      Number(comparisonData.previousPurchaseStats.totalAmount)
                    )).toFixed(1)}%
                  </div>
                  <p className="text-xs text-gray-500">So với kỳ trước: {formatCurrency(Number(comparisonData.previousPurchaseStats.totalAmount))}</p>
                </div>
              )}
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Số phiếu nhập</p>
                  <h3 className="text-xl font-bold text-gray-800 mt-1">
                    {reportData.monthlyPurchases ? formatNumber(
                      reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.count), 0)
                    ) : "0"}
                  </h3>
                </div>
                <div className="p-2 bg-green-100 rounded-md text-green-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
              </div>
              {compareLastPeriod && comparisonData.previousPurchaseStats && (
                <div className="mt-2">
                  <div className={`text-sm flex items-center ${
                    reportData.monthlyPurchases && 
                    reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.count), 0) > 
                    Number(comparisonData.previousPurchaseStats.orderCount)
                      ? 'text-green-600' 
                      : 'text-red-600'
                  }`}>
                    {reportData.monthlyPurchases && 
                      reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.count), 0) > 
                      Number(comparisonData.previousPurchaseStats.orderCount) ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                    {reportData.monthlyPurchases && Math.abs(calculateChange(
                      reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.count), 0),
                      Number(comparisonData.previousPurchaseStats.orderCount)
                    )).toFixed(1)}%
                  </div>
                  <p className="text-xs text-gray-500">So với kỳ trước: {formatNumber(Number(comparisonData.previousPurchaseStats.orderCount))}</p>
                </div>
              )}
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">Giá trị trung bình</p>
                  <h3 className="text-xl font-bold text-gray-800 mt-1">
                    {reportData.monthlyPurchases && reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.count), 0) > 0
                      ? formatCurrency(
                          reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.amount), 0) /
                          reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.count), 0)
                        )
                      : "0 đ"
                    }
                  </h3>
                </div>
                <div className="p-2 bg-purple-100 rounded-md text-purple-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
              {compareLastPeriod && comparisonData.previousPurchaseStats && comparisonData.previousPurchaseStats.orderCount > 0 && (
                <div className="mt-2">
                  <div className={`text-sm flex items-center ${
                    reportData.monthlyPurchases && 
                    reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.count), 0) > 0 &&
                    reportData.monthlyPurchases && 
                      reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.count), 0) > 0 &&
                      (reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.amount), 0) /
                      reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.count), 0)) >
                      (Number(comparisonData.previousPurchaseStats.totalAmount) / Number(comparisonData.previousPurchaseStats.orderCount))
                        ? 'text-green-600' 
                        : 'text-red-600'
                    }`}>
                      {reportData.monthlyPurchases && 
                        reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.count), 0) > 0 &&
                        (reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.amount), 0) /
                        reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.count), 0)) >
                        (Number(comparisonData.previousPurchaseStats.totalAmount) / Number(comparisonData.previousPurchaseStats.orderCount)) ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                      {reportData.monthlyPurchases && Math.abs(calculateChange(
                        reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.amount), 0) /
                        reportData.monthlyPurchases.reduce((sum: number, item: any) => sum + Number(item.count), 0),
                        Number(comparisonData.previousPurchaseStats.totalAmount) / Number(comparisonData.previousPurchaseStats.orderCount)
                      )).toFixed(1)}%
                    </div>
                    <p className="text-xs text-gray-500">
                      So với kỳ trước: {formatCurrency(Number(comparisonData.previousPurchaseStats.totalAmount) / Number(comparisonData.previousPurchaseStats.orderCount))}
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Monthly purchases chart */}
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Xu hướng nhập hàng theo tháng</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === 'line' ? (
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Line type="monotone" dataKey="value" stroke={COLORS.primary} strokeWidth={2} activeDot={{ r: 8 }} name="Giá trị nhập hàng" />
                      <Line type="monotone" dataKey="count" stroke={COLORS.secondary} strokeWidth={2} activeDot={{ r: 6 }} name="Số lượng phiếu nhập" />
                    </LineChart>
                  ) : chartType === 'bar' ? (
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis yAxisId="left" orientation="left" stroke={COLORS.primary} />
                      <YAxis yAxisId="right" orientation="right" stroke={COLORS.secondary} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar yAxisId="left" dataKey="value" fill={COLORS.primary} name="Giá trị nhập hàng" />
                      <Bar yAxisId="right" dataKey="count" fill={COLORS.secondary} name="Số lượng phiếu nhập" />
                    </BarChart>
                  ) : (
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Area type="monotone" dataKey="value" stroke={COLORS.primary} fill={COLORS.primaryLight} name="Giá trị nhập hàng" />
                      <Area type="monotone" dataKey="count" stroke={COLORS.secondary} fill={COLORS.secondaryLight} name="Số lượng phiếu nhập" />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Suppliers and payment status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Top 5 nhà cung cấp</h2>
                <div className="h-72 overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Nhà cung cấp
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Số phiếu
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tổng giá trị
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          TB/Đơn
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {reportData.topSuppliers && reportData.topSuppliers.map((supplier: any, index: number) => (
                        <tr key={supplier.id}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center text-xs font-medium text-white bg-blue-500 rounded-full">
                                {index + 1}
                              </div>
                              <div className="ml-3">
                                <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500">
                            {formatNumber(Number(supplier.orderCount))}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                            {formatCurrency(Number(supplier.totalAmount))}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500">
                            {formatCurrency(Number(supplier.avgOrderValue))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Trạng thái thanh toán</h2>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color || COLORS.chart[index % COLORS.chart.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            
            {/* Top purchased products */}
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Top 10 sản phẩm nhập hàng</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Sản phẩm
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Số lượng
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Giá trị
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Giá trung bình
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Danh mục
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {topProducts.map((product: any, index: number) => (
                      <tr key={product.id}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center text-xs font-medium text-white bg-blue-500 rounded-full">
                              {index + 1}
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-gray-900">{product.name}</div>
                              <div className="text-xs text-gray-500">{product.code}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                          {formatNumber(Number(product.totalQuantity))}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                          {formatCurrency(Number(product.totalAmount))}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500">
                          {formatCurrency(Number(product.totalAmount) / Number(product.totalQuantity))}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {product.categoryName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        
        {/* Download options */}
        <div className="mt-6 flex justify-end">
          <div className="flex space-x-2">
            <Link
              to={`/admin/reports/export?type=${reportType}&startDate=${startDate}&endDate=${endDate}`}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Xuất Excel
            </Link>
            
            <Link
              to={`/admin/reports/print?type=${reportType}&startDate=${startDate}&endDate=${endDate}`}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
              target="_blank"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              In báo cáo
            </Link>
          </div>
        </div>
      </div>
    );
  }
