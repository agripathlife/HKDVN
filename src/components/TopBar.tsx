import React from 'react';
import { AppTab, BusinessModel } from '../types';

interface TopBarProps {
  activeTab: AppTab;
  model: BusinessModel;
  onNavigate: (tab: AppTab) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ activeTab, model, onNavigate }) => {
  const navItems: Array<{ tab: AppTab; label: string }> = [
    { tab: AppTab.PORTAL, label: 'Cổng khởi tạo' },
    { tab: AppTab.STOREFRONT, label: 'Cửa hàng' },
    {
      tab: AppTab.OPERATIONS,
      label: model === BusinessModel.RETAIL ? 'POS Tính tiền' : 'Bếp & Thu ngân',
    },
    { tab: AppTab.ADMIN, label: 'Quản trị SP' },
  ];

  const primaryActionLabel =
    activeTab === AppTab.PORTAL ? 'Mở Cửa hàng' : 'Thiết lập BYOB';
  const primaryActionTarget =
    activeTab === AppTab.PORTAL ? AppTab.STOREFRONT : AppTab.PORTAL;

  return (
    <header className="no-print sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => onNavigate(AppTab.PORTAL)}
          className="text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
        >
          HKDVN
        </button>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                type="button"
                onClick={() => onNavigate(item.tab)}
                className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'border-[#0F766E] text-[#0F766E] font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={() => onNavigate(primaryActionTarget)}
            className="px-4 py-2 min-h-[40px] text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D655E] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {primaryActionLabel}
          </button>
        </div>
      </div>

      {/* Mobile compact navigation */}
      <nav className="md:hidden flex items-center justify-around border-t border-slate-100 px-2 h-11 bg-white">
        {navItems.map((item) => {
          const isActive = activeTab === item.tab;
          return (
            <button
              key={item.tab}
              type="button"
              onClick={() => onNavigate(item.tab)}
              className={`px-2 py-1.5 text-xs whitespace-nowrap shrink-0 ${
                isActive ? 'text-[#0F766E] font-semibold' : 'text-slate-600'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
