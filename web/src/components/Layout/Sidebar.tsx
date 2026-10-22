import { Link, useLocation } from 'react-router-dom';
// Lấy danh sách menu từ file cấu hình chung của team
import { MENU_ITEMS } from '../../constants/menu'; 

const Sidebar = () => {
  const location = useLocation();

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col min-h-screen">
      <div className="h-16 flex items-center justify-center border-b border-gray-800">
        <h1 className="text-xl font-bold uppercase tracking-wider">Chung Cư X</h1>
      </div>
      <nav className="flex-1 px-4 py-6 space-y-2">
        {MENU_ITEMS.map((item: any) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              className={`block px-4 py-3 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-800 text-sm text-gray-500 text-center">
        © 2026 Quản lý Tòa nhà
      </div>
    </aside>
  );
};

export default Sidebar;