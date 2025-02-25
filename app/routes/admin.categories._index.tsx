import { useState, useEffect } from "react";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { db } from "~/utils/db.server";
import { requireAdmin } from "~/utils/session.server";

// Định nghĩa kiểu dữ liệu cho danh mục
type Category = {
  id: number;
  name: string;
  description: string | null;
  parentId: number | null;
  parent: {
    id: number;
    name: string;
  } | null;
  _count: {
    products: number;
    subcategories: number;
  };
};

// Định nghĩa kiểu dữ liệu cho dữ liệu loader
type LoaderData = {
  categories: Category[];
  parentCategories: {
    id: number;
    name: string;
  }[];
};

// Định nghĩa kiểu dữ liệu cho dữ liệu action
type ActionData = {
  ok?: boolean;
  error?: string;
  fieldErrors?: {
    name?: string;
    parentId?: string;
  };
};

// Loader để lấy dữ liệu danh mục
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Kiểm tra quyền admin
  await requireAdmin(request);

  // Lấy danh sách tất cả danh mục với thông tin liên quan
  const categories = await db.category.findMany({
    include: {
      parent: {
        select: {
          id: true,
          name: true
        }
      },
      _count: {
        select: {
          products: true,
          subcategories: true
        }
      }
    },
    orderBy: [
      { parentId: "asc" },
      { name: "asc" }
    ]
  });

  // Lấy danh sách danh mục cha (không có parentId) cho dropdown
  const parentCategories = await db.category.findMany({
    where: {
      parentId: null
    },
    select: {
      id: true,
      name: true
    },
    orderBy: { name: "asc" }
  });

  return json<LoaderData>({ categories, parentCategories });
};

// Action xử lý các thao tác trên danh mục
export const action = async ({ request }: ActionFunctionArgs) => {
  // Kiểm tra quyền admin
  await requireAdmin(request);

  const formData = await request.formData();
  const intent = formData.get("_action") as string;

  // Xử lý thêm mới danh mục
  if (intent === "create") {
    const name = formData.get("name") as string;
    const description = formData.get("description") as string || null;
    const parentIdStr = formData.get("parentId") as string || null;
    const parentId = parentIdStr && parentIdStr !== "" ? parseInt(parentIdStr) : null;

    // Xác thực dữ liệu
    const fieldErrors: ActionData["fieldErrors"] = {};
    if (!name || name.trim() === "") {
      fieldErrors.name = "Tên danh mục không được để trống";
    }

    // Nếu có lỗi, trả về ngay
    if (Object.keys(fieldErrors).length > 0) {
      return json<ActionData>({ fieldErrors }, { status: 400 });
    }

    try {
      // Thêm danh mục mới
      await db.category.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          parentId
        }
      });

      return json<ActionData>({ ok: true });
    } catch (error) {
      return json<ActionData>({ 
        error: "Có lỗi xảy ra khi thêm danh mục. Vui lòng thử lại." 
      }, { status: 500 });
    }
  }

  // Xử lý xóa danh mục
  if (intent === "delete") {
    const categoryId = parseInt(formData.get("categoryId") as string);

    try {
      // Kiểm tra xem danh mục có chứa danh mục con hoặc sản phẩm không
      const categoryToDelete = await db.category.findUnique({
        where: { id: categoryId },
        include: {
          _count: {
            select: {
              products: true,
              subcategories: true
            }
          }
        }
      });

      if (!categoryToDelete) {
        return json<ActionData>({ 
          error: "Danh mục không tồn tại" 
        }, { status: 404 });
      }

      // Kiểm tra ràng buộc trước khi xóa
      if (categoryToDelete._count.products > 0) {
        return json<ActionData>({ 
          error: "Không thể xóa danh mục này vì có sản phẩm bên trong. Vui lòng di chuyển sản phẩm trước." 
        }, { status: 400 });
      }

      if (categoryToDelete._count.subcategories > 0) {
        return json<ActionData>({ 
          error: "Không thể xóa danh mục này vì có danh mục con. Vui lòng xóa danh mục con trước." 
        }, { status: 400 });
      }

      // Tiến hành xóa danh mục
      await db.category.delete({
        where: { id: categoryId }
      });

      return json<ActionData>({ ok: true });
    } catch (error) {
      return json<ActionData>({ 
        error: "Có lỗi xảy ra khi xóa danh mục. Vui lòng thử lại." 
      }, { status: 500 });
    }
  }

  // Xử lý cập nhật danh mục
  if (intent === "update") {
    const categoryId = parseInt(formData.get("categoryId") as string);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string || null;
    const parentIdStr = formData.get("parentId") as string || null;
    const parentId = parentIdStr && parentIdStr !== "" ? parseInt(parentIdStr) : null;

    // Xác thực dữ liệu
    const fieldErrors: ActionData["fieldErrors"] = {};
    if (!name || name.trim() === "") {
      fieldErrors.name = "Tên danh mục không được để trống";
    }

    // Nếu có lỗi, trả về ngay
    if (Object.keys(fieldErrors).length > 0) {
      return json<ActionData>({ fieldErrors }, { status: 400 });
    }

    try {
      // Kiểm tra không cho phép chọn chính nó làm cha
      if (parentId === categoryId) {
        return json<ActionData>({ 
          error: "Không thể chọn chính danh mục này làm danh mục cha" 
        }, { status: 400 });
      }

      // Kiểm tra không cho phép chọn con làm cha (tránh vòng lặp)
      if (parentId !== null) {
        const isDescendant = await isDescendantCategory(categoryId, parentId);
        if (isDescendant) {
          return json<ActionData>({ 
            error: "Không thể chọn danh mục con làm danh mục cha (tránh vòng lặp)" 
          }, { status: 400 });
        }
      }

      // Cập nhật danh mục
      await db.category.update({
        where: { id: categoryId },
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          parentId
        }
      });

      return json<ActionData>({ ok: true });
    } catch (error) {
      return json<ActionData>({ 
        error: "Có lỗi xảy ra khi cập nhật danh mục. Vui lòng thử lại." 
      }, { status: 500 });
    }
  }

  return json<ActionData>({ error: "Thao tác không hợp lệ" }, { status: 400 });
};

// Hàm kiểm tra xem một danh mục có phải là con cháu của danh mục khác không
async function isDescendantCategory(ancestorId: number, descendantId: number): Promise<boolean> {
  const descendant = await db.category.findUnique({
    where: { id: descendantId },
    select: { parentId: true }
  });

  if (!descendant || descendant.parentId === null) {
    return false;
  }

  if (descendant.parentId === ancestorId) {
    return true;
  }

  return isDescendantCategory(ancestorId, descendant.parentId);
}

export default function Categories() {
  // Lấy dữ liệu từ loader và action
  const { categories, parentCategories } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();

  // State quản lý UI
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<number, boolean>>({});
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Xử lý hiển thị thông báo khi có kết quả từ action
  useEffect(() => {
    if (actionData?.ok) {
      setNotification({
        type: "success",
        message: "Thao tác thành công!"
      });
      
      // Đóng form sau khi thao tác thành công
      setShowCreateForm(false);
      setEditingCategory(null);
      setConfirmDelete(null);
      
      // Tự động ẩn thông báo sau 3 giây
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);
      
      return () => clearTimeout(timer);
    } else if (actionData?.error) {
      setNotification({
        type: "error",
        message: actionData.error
      });
    }
  }, [actionData]);

  // Xử lý xóa danh mục
  const handleDeleteCategory = (categoryId: number) => {
    const formData = new FormData();
    formData.append("_action", "delete");
    formData.append("categoryId", categoryId.toString());
    
    submit(formData, { method: "post" });
    setConfirmDelete(null);
  };

  // Chuyển đổi trạng thái mở rộng của danh mục
  const toggleCategory = (categoryId: number) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  // Lọc danh mục gốc (không có parent)
  const rootCategories = categories.filter(cat => cat.parentId === null);
  
  // Hàm lấy danh mục con
  const getChildCategories = (parentId: number) => 
    categories.filter(cat => cat.parentId === parentId);

  // Render cây danh mục đệ quy
  const renderCategoryTree = (category: Category, level: number = 0) => {
    const children = getChildCategories(category.id);
    const isExpanded = expandedCategories[category.id];
    
    return (
      <div key={category.id} className="category-item">
        <div 
          className={`flex items-center py-3 px-4 hover:bg-gray-50 ${
            level > 0 ? 'ml-6 border-l border-gray-200 pl-4' : ''
          }`}
        >
          <div className="flex-1">
            <div className="flex items-center">
              {children.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  className="mr-2 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {isExpanded ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              )}
              <span className="font-medium text-gray-900">{category.name}</span>
              {category.description && (
                <span className="ml-2 text-sm text-gray-500 truncate max-w-xs">
                  {category.description}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center text-xs text-gray-500">
              {category.parent && (
                <span className="mr-2 px-2 py-0.5 bg-gray-100 rounded-md">
                  Thuộc: {category.parent.name}
                </span>
              )}
              <span className="mr-2">
                {category._count.products} sản phẩm
              </span>
              <span>
                {category._count.subcategories} danh mục con
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setEditingCategory(category)}
              className="text-blue-600 hover:text-blue-900 p-1"
              aria-label="Chỉnh sửa"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => setConfirmDelete(category.id)}
              className="text-red-600 hover:text-red-900 p-1"
              aria-label="Xóa"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
        {isExpanded && children.length > 0 && (
          <div className="pl-4">
            {children.map(child => renderCategoryTree(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Quản lý danh mục sản phẩm</h1>
        <button
          onClick={() => {
            setShowCreateForm(!showCreateForm);
            setEditingCategory(null);
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md 
            flex items-center transition-colors duration-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Thêm danh mục mới
        </button>
      </div>

      {/* Hiển thị thông báo */}
      {notification && (
        <div className={`mb-6 p-4 rounded-md ${
          notification.type === "success" 
            ? "bg-green-50 border-l-4 border-green-400" 
            : "bg-red-50 border-l-4 border-red-400"
        }`}>
          <div className="flex">
            <div className="flex-shrink-0">
              {notification.type === "success" ? (
                <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="ml-3">
              <p className={`text-sm ${
                notification.type === "success" ? "text-green-700" : "text-red-700"
              }`}>
                {notification.message}
              </p>
            </div>
            <div className="ml-auto pl-3">
              <div className="-mx-1.5 -my-1.5">
                <button
                  onClick={() => setNotification(null)}
                  className={`inline-flex rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    notification.type === "success" 
                      ? "bg-green-50 text-green-500 hover:bg-green-100 focus:ring-green-600" 
                      : "bg-red-50 text-red-500 hover:bg-red-100 focus:ring-red-600"
                  }`}
                >
                  <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form thêm mới danh mục */}
      {showCreateForm && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Thêm danh mục mới</h2>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="_action" value="create" />
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Tên danh mục <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                  actionData?.fieldErrors?.name 
                    ? "border-red-300 focus:border-red-500 focus:ring-red-500" 
                    : "border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                }`}
                placeholder="Nhập tên danh mục"
              />
              {actionData?.fieldErrors?.name && (
                <p className="mt-1 text-sm text-red-600">{actionData.fieldErrors.name}</p>
              )}
            </div>
            <div>
              <label htmlFor="parentId" className="block text-sm font-medium text-gray-700 mb-1">
                Danh mục cha
              </label>
              <select
                id="parentId"
                name="parentId"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Không có danh mục cha</option>
                {parentCategories.map(category => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              {actionData?.fieldErrors?.parentId && (
                <p className="mt-1 text-sm text-red-600">{actionData.fieldErrors.parentId}</p>
              )}
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Mô tả
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Nhập mô tả (không bắt buộc)"
              ></textarea>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={navigation.state === "submitting"}
                className="px-4 py-2 bg-indigo-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-75"
              >
                {navigation.state === "submitting" ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </Form>
        </div>
      )}

      {/* Form chỉnh sửa danh mục */}
      {editingCategory && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Chỉnh sửa danh mục</h2>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="_action" value="update" />
            <input type="hidden" name="categoryId" value={editingCategory.id} />
            <div>
              <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 mb-1">
                Tên danh mục <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="edit-name"
                name="name"
                required
                defaultValue={editingCategory.name}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                  actionData?.fieldErrors?.name 
                    ? "border-red-300 focus:border-red-500 focus:ring-red-500" 
                    : "border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                }`}
              />
              {actionData?.fieldErrors?.name && (
                <p className="mt-1 text-sm text-red-600">{actionData.fieldErrors.name}</p>
              )}
            </div>
            <div>
              <label htmlFor="edit-parentId" className="block text-sm font-medium text-gray-700 mb-1">
                Danh mục cha
              </label>
              <select
                id="edit-parentId"
                name="parentId"
                defaultValue={editingCategory.parentId?.toString() || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Không có danh mục cha</option>
                {parentCategories
                  .filter(cat => cat.id !== editingCategory.id)
                  .map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))
                }
              </select>
              {actionData?.fieldErrors?.parentId && (
                <p className="mt-1 text-sm text-red-600">{actionData.fieldErrors.parentId}</p>
              )}
            </div>
            <div>
              <label htmlFor="edit-description" className="block text-sm font-medium text-gray-700 mb-1">
                Mô tả
              </label>
              <textarea
                id="edit-description"
                name="description"
                rows={3}
                defaultValue={editingCategory.description || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              ></textarea>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={navigation.state === "submitting"}
                className="px-4 py-2 bg-indigo-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-75"
              >
                {navigation.state === "submitting" ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </Form>
        </div>
      )}

      {/* Danh sách danh mục */}
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-800">Danh sách danh mục</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {categories.length === 0 ? (
            <div className="py-6 text-center text-gray-500">
              Chưa có danh mục nào. Hãy thêm danh mục mới.
            </div>
          ) : (
            <div>
              {rootCategories.map(category => renderCategoryTree(category))}
            </div>
          )}
        </div>
      </div>

      {/* Dialog xác nhận xóa */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-2">Xác nhận xóa</h3>
            <p className="text-gray-700 mb-4">
              Bạn có chắc chắn muốn xóa danh mục này? Hành động này không thể hoàn tác.
            </p>
            {/* Hiển thị thông tin danh mục sắp xóa */}
            {categories.find(c => c.id === confirmDelete) && (
              <div className="mb-4 p-3 bg-gray-50 rounded-md">
                <p className="font-medium text-gray-800">
                  {categories.find(c => c.id === confirmDelete)?.name}
                </p>
                {categories.find(c => c.id === confirmDelete)?.description && (
                  <p className="text-sm text-gray-600 mt-1">
                    {categories.find(c => c.id === confirmDelete)?.description}
                  </p>
                )}
                <div className="mt-2 text-xs text-gray-500 flex">
                  <span className="mr-2">
                    {categories.find(c => c.id === confirmDelete)?._count.products} sản phẩm
                  </span>
                  <span>
                    {categories.find(c => c.id === confirmDelete)?._count.subcategories} danh mục con
                  </span>
                </div>
              </div>
            )}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Hủy
              </button>
              <button
                onClick={() => handleDeleteCategory(confirmDelete)}
                disabled={navigation.state === "submitting"}
                className="px-4 py-2 bg-red-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                {navigation.state === "submitting" ? "Đang xóa..." : "Xác nhận xóa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Thêm component Error Boundary để xử lý lỗi ngoài dự kiến
export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm leading-5 font-medium text-red-800">
              Đã xảy ra lỗi
            </h3>
            <div className="mt-1 text-sm leading-5 text-red-700">
              {error.message}
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-center">
        <Link
          to="/admin/categories"
          className="inline-flex items-center px-4 py-2 border border-transparent text-base leading-6 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:border-indigo-700 focus:shadow-outline-indigo active:bg-indigo-700 transition ease-in-out duration-150"
        >
          Làm mới trang
        </Link>
      </div>
    </div>
  );
}
