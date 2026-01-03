
import React from 'react';

interface MarkingMenuProps {
    onSelect: (label: string) => void;
    onClose: () => void;
    position: { x: number, y: number };
}

// Full Label -> Short Label Mapping
// "司令" -> "司"
const MARKS = [
    { label: "司 (司令)", value: "司" },
    { label: "军 (军长)", value: "军" },
    { label: "师 (师长)", value: "师" },
    { label: "旅 (旅长)", value: "旅" },
    { label: "团 (团长)", value: "团" },
    { label: "营 (营长)", value: "营" },
    { label: "连 (连长)", value: "连" },
    { label: "排 (排长)", value: "排" },
    { label: "工 (工兵)", value: "工" },
    { label: "炸 (炸弹)", value: "炸" },
    { label: "雷 (地雷)", value: "雷" },
    { label: "大 (大子)", value: "大" },
    { label: "小 (小子)", value: "小" },
    { label: "非 (非炸)", value: "非" },
    { label: "取消", value: "" }
];

const MarkingMenu: React.FC<MarkingMenuProps> = ({ onSelect, onClose, position }) => {
    // Smart Positioning Logic
    // If click is on right side, show menu to left.
    // If click is on bottom side, show menu above.
    const menuWidth = 220;
    const menuHeight = 280; // Approx
    const offset = 10;

    const isRight = position.x > window.innerWidth / 2;
    const isBottom = position.y > window.innerHeight / 2;

    const left = isRight ? Math.max(10, position.x - menuWidth - offset) : Math.min(window.innerWidth - menuWidth - 10, position.x + offset);
    const top = isBottom ? Math.max(10, position.y - menuHeight - offset) : Math.min(window.innerHeight - menuHeight - 10, position.y + offset);

    return (
        <div
            className="fixed inset-0 z-50 bg-black/5"
            onClick={onClose}
        >
            <div
                className="bg-gray-900 border border-yellow-500 rounded-lg p-3 grid grid-cols-3 gap-2 shadow-2xl animate-in fade-in zoom-in-95 duration-100 ring-2 ring-white/10"
                style={{
                    position: 'absolute',
                    left,
                    top,
                    width: `${menuWidth}px`
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {MARKS.map((item) => (
                    <button
                        key={item.value || "cancel"}
                        onClick={() => onSelect(item.value)}
                        className={`px-3 py-2 rounded text-sm font-bold transition-transform active:scale-95 border border-white/10 shadow-md ${!item.value
                            ? "bg-red-900/80 text-red-200 hover:bg-red-800 col-span-3 mt-1"
                            : item.value === "炸" || item.value === "雷"
                                ? "bg-orange-800/80 text-orange-100 hover:bg-orange-700"
                                : "bg-blue-900/80 text-blue-100 hover:bg-blue-800"
                            }`}
                        title={item.label}
                    >
                        {item.value || "取消标记"}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default MarkingMenu;
