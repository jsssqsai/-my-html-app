/**
 * 芯烨 XPrinter 蓝牙打印模块
 * 支持通过 Web Bluetooth API 连接蓝牙小票机
 */

class BluetoothPrinter {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristic = null;
        this.isConnected = false;
        this.printerName = '';
        
        // 芯烨打印机常用的蓝牙服务和特征值 UUID
        // 这些 UUID 可能因具体型号而异
        this.PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';  // 通用打印机服务
        this.PRINTER_CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';  // 写入特征值
        
        // 备选 UUID（不同型号可能使用不同的 UUID）
        this.ALT_SERVICE_UUIDS = [
            '000018f0-0000-1000-8000-00805f9b34fb',
            'e7810a71-73ae-499d-8c15-faa9aef0c3f2',  // 某些芯烨型号
            '49535343-fe7d-4ae5-8fa9-9fafd205e455',  // 另一种常见 UUID
        ];
        
        this.ALT_CHARACTERISTIC_UUIDS = [
            '00002af1-0000-1000-8000-00805f9b34fb',
            'e7810a72-73ae-499d-8c15-faa9aef0c3f2',
            '49535343-8841-43f4-a8d4-ecbe34729bb3',
        ];
    }

    /**
     * 检查浏览器是否支持 Web Bluetooth
     */
    static isSupported() {
        return 'bluetooth' in navigator;
    }

    /**
     * 请求连接蓝牙打印机
     */
    async connect() {
        if (!BluetoothPrinter.isSupported()) {
            throw new Error('您的浏览器不支持蓝牙功能，请使用 Chrome 或 Edge 浏览器');
        }

        try {
            // 请求蓝牙设备 - 添加名称过滤，更容易找到芯烨打印机
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'XP-' },      // 芯烨打印机通常以 XP- 开头
                    { namePrefix: 'XPrinter' },
                    { namePrefix: 'Printer' },
                ],
                optionalServices: this.ALT_SERVICE_UUIDS
            });

            this.printerName = this.device.name || '未知打印机';
            console.log('选择的打印机:', this.printerName);

            // 监听断开连接事件
            this.device.addEventListener('gattserverdisconnected', () => {
                this.isConnected = false;
                console.log('打印机已断开连接');
                if (this.onDisconnect) {
                    this.onDisconnect();
                }
            });

            // 连接 GATT 服务器
            this.server = await this.device.gatt.connect();
            console.log('已连接到 GATT 服务器');

            // 尝试获取服务和特征值
            await this._findServiceAndCharacteristic();

            this.isConnected = true;
            return {
                success: true,
                printerName: this.printerName
            };

        } catch (error) {
            console.error('连接打印机失败:', error);
            
            // 优化错误提示
            let errorMessage = error.message;
            if (error.name === 'NotFoundError') {
                errorMessage = '未找到蓝牙设备，请确保：\n1. 打印机已开启\n2. 打印机处于可发现模式\n3. iPad 蓝牙已开启';
            } else if (error.name === 'SecurityError') {
                errorMessage = '蓝牙权限被拒绝，请允许网页访问蓝牙';
            } else if (error.name === 'AbortError') {
                errorMessage = '您取消了设备选择，请重新点击连接按钮';
            } else if (error.message.includes('User cancelled')) {
                errorMessage = '您取消了设备选择，请重新点击连接按钮';
            }
            
            throw new Error(errorMessage);
        }
    }

    /**
     * 查找可用的服务和特征值
     */
    async _findServiceAndCharacteristic() {
        let lastError = null;

        // 尝试不同的服务 UUID
        for (const serviceUuid of this.ALT_SERVICE_UUIDS) {
            try {
                console.log('尝试获取服务:', serviceUuid);
                this.service = await this.server.getPrimaryService(serviceUuid);
                console.log('找到服务:', serviceUuid);

                // 尝试不同的特征值 UUID
                for (const charUuid of this.ALT_CHARACTERISTIC_UUIDS) {
                    try {
                        console.log('尝试获取特征值:', charUuid);
                        this.characteristic = await this.service.getCharacteristic(charUuid);
                        console.log('找到特征值:', charUuid);
                        
                        // 检查特征值是否支持写入
                        const properties = this.characteristic.properties;
                        if (properties.write || properties.writeWithoutResponse) {
                            console.log('特征值支持写入');
                            return;
                        }
                    } catch (e) {
                        lastError = e;
                        continue;
                    }
                }
            } catch (e) {
                lastError = e;
                continue;
            }
        }

        // 如果标准 UUID 都不行，尝试获取所有服务
        console.log('尝试扫描所有服务...');
        try {
            const services = await this.server.getPrimaryServices();
            console.log('找到的服务数量:', services.length);
            
            for (const service of services) {
                console.log('服务 UUID:', service.uuid);
                try {
                    const characteristics = await service.getCharacteristics();
                    console.log('特征值数量:', characteristics.length);
                    
                    for (const char of characteristics) {
                        console.log('特征值 UUID:', char.uuid, '属性:', char.properties);
                        if (char.properties.write || char.properties.writeWithoutResponse) {
                            this.service = service;
                            this.characteristic = char;
                            console.log('找到可写入的特征值');
                            return;
                        }
                    }
                } catch (e) {
                    console.log('获取特征值失败:', e);
                }
            }
        } catch (e) {
            console.log('扫描服务失败:', e);
        }

        throw new Error('未找到可用的打印机服务，请确保选择的是芯烨 XPrinter 打印机');
    }

    /**
     * 断开连接
     */
    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.isConnected = false;
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristic = null;
    }

    /**
     * 打印文本（ESC/POS 指令）
     * 使用 GBK 编码确保中文正常显示
     */
    async print(text) {
        if (!this.isConnected || !this.characteristic) {
            throw new Error('打印机未连接');
        }

        try {
            // 使用 GBK 编码器将文本转换为 Uint8Array
            const gbkEncoder = new GBKEncoder();
            const data = gbkEncoder.encode(text);
            
            // 分段发送数据（每次最多 512 字节）
            const chunkSize = 512;
            for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                await this.characteristic.writeValue(chunk);
            }
            
            return true;
        } catch (error) {
            console.error('打印失败:', error);
            throw new Error('打印失败: ' + error.message);
        }
    }

    /**
     * 打印原始数据（ArrayBuffer）
     */
    async printRaw(data) {
        if (!this.isConnected || !this.characteristic) {
            throw new Error('打印机未连接');
        }

        try {
            // 分段发送数据
            const chunkSize = 512;
            for (let i = 0; i < data.byteLength; i += chunkSize) {
                const chunk = data.slice(i, Math.min(i + chunkSize, data.byteLength));
                await this.characteristic.writeValue(chunk);
            }
            return true;
        } catch (error) {
            console.error('打印失败:', error);
            throw new Error('打印失败: ' + error.message);
        }
    }

    /**
     * 获取打印机状态
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            printerName: this.printerName,
            hasCharacteristic: !!this.characteristic
        };
    }
}

/**
 * ESC/POS 指令生成器
 */
class EscPosCommands {
    constructor() {
        // 基本指令
        this.ESC = 0x1B;
        this.GS = 0x1D;
        this.LF = 0x0A;
        this.CR = 0x0D;
        this.HT = 0x09;
        this.FF = 0x0C;
    }

    /**
     * 初始化打印机
     */
    init() {
        return new Uint8Array([this.ESC, 0x40]);
    }

    /**
     * 换行
     */
    newline() {
        return new Uint8Array([this.LF]);
    }

    /**
     * 设置对齐方式
     * 0: 左对齐, 1: 居中, 2: 右对齐
     */
    align(align) {
        return new Uint8Array([this.ESC, 0x61, align]);
    }

    /**
     * 设置字体大小
     * width: 1-8, height: 1-8
     */
    setSize(width, height) {
        const size = ((width - 1) << 4) | (height - 1);
        return new Uint8Array([this.GS, 0x21, size]);
    }

    /**
     * 恢复正常字体大小
     */
    normalSize() {
        return new Uint8Array([this.GS, 0x21, 0x00]);
    }

    /**
     * 加粗
     */
    bold(on) {
        return new Uint8Array([this.ESC, 0x45, on ? 0x01 : 0x00]);
    }

    /**
     * 切纸
     */
    cut() {
        return new Uint8Array([this.GS, 0x56, 0x00]);
    }

    /**
     * 打印并走纸
     */
    feed(lines) {
        return new Uint8Array([this.ESC, 0x64, lines]);
    }

    /**
     * 将文本转换为 Uint8Array（使用 GBK 编码）
     * 芯烨打印机需要使用 GBK 编码才能正确显示中文
     */
    textToBytes(text) {
        // 使用 GBK 编码表进行编码转换
        const gbkEncoder = new GBKEncoder();
        return gbkEncoder.encode(text);
    }

    /**
     * 生成小票内容（入口方法）
     * @param {string} template - 模板名称: 'standard'(标准), 'simple'(简洁), 'compact'(紧凑), 'detail'(详细)
     */
    generateReceipt(shopInfo, orderItems, total, remark, template) {
        template = template || 'standard';
        switch (template) {
            case 'simple':  return this._templateSimple(shopInfo, orderItems, total, remark);
            case 'compact': return this._templateCompact(shopInfo, orderItems, total, remark);
            case 'detail':  return this._templateDetail(shopInfo, orderItems, total, remark);
            default:        return this._templateStandard(shopInfo, orderItems, total, remark);
        }
    }

    /**
     * 辅助方法：格式化日期时间
     */
    _formatDateTime() {
        const now = new Date();
        const y = now.getFullYear();
        const M = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        return { dateStr: `${y}-${M}-${d}`, timeStr: `${h}:${m}:${s}` };
    }

    /**
     * 辅助方法：合并命令数组为 Uint8Array
     */
    _mergeCommands(commands) {
        let totalLength = commands.reduce((sum, arr) => sum + arr.length, 0);
        let result = new Uint8Array(totalLength);
        let offset = 0;
        commands.forEach(arr => {
            result.set(arr, offset);
            offset += arr.length;
        });
        return result;
    }

    /**
     * 标准版模板（当前格式，宽松美观）
     */
    _templateStandard(shopInfo, orderItems, total, remark) {
        const { dateStr, timeStr } = this._formatDateTime();
        let c = [];

        c.push(this.init());
        c.push(this.newline());

        // 店铺名称 - 居中放大
        c.push(this.align(1));
        c.push(this.setSize(2, 2));
        c.push(this.textToBytes(shopInfo.name || '生鲜小票'));
        c.push(this.newline());
        c.push(this.normalSize());
        c.push(this.newline());
        c.push(this.newline());

        // 地址和电话 - 居中
        c.push(this.align(1));
        if (shopInfo.address) { c.push(this.textToBytes(shopInfo.address)); c.push(this.newline()); }
        if (shopInfo.phone) { c.push(this.textToBytes(shopInfo.phone)); c.push(this.newline()); }
        c.push(this.align(0));
        c.push(this.newline());

        // 日期时间 - 居中
        c.push(this.align(1));
        c.push(this.textToBytes(dateStr + ' ' + timeStr));
        c.push(this.newline());
        c.push(this.align(0));
        c.push(this.newline());

        // 分隔线
        c.push(this.textToBytes('================'));
        c.push(this.newline());
        c.push(this.newline());

        // 商品列表标题
        c.push(this.bold(1));
        c.push(this.textToBytes('商品名称   数量    金额'));
        c.push(this.bold(0));
        c.push(this.newline());
        c.push(this.newline());

        // 商品列表
        orderItems.forEach((item, index) => {
            const name = item.name.substring(0, 6).padEnd(6, ' ');
            const qty = (item.quantity + item.unit).substring(0, 6).padStart(6, ' ');
            const price = ('¥' + item.subtotal.toFixed(2)).padStart(8, ' ');
            c.push(this.textToBytes(name + '  ' + qty + '  ' + price));
            c.push(this.newline());
            if (orderItems.length > 1 && index < orderItems.length - 1) c.push(this.newline());
        });

        c.push(this.newline());
        c.push(this.textToBytes('================'));
        c.push(this.newline());
        c.push(this.newline());

        // 备注
        if (remark) { c.push(this.textToBytes('备注: ' + remark)); c.push(this.newline()); c.push(this.newline()); }

        // 总计
        c.push(this.bold(1));
        c.push(this.setSize(2, 2));
        c.push(this.align(1));
        c.push(this.textToBytes('合计: ¥' + total.toFixed(2)));
        c.push(this.newline());
        c.push(this.normalSize());
        c.push(this.bold(0));
        c.push(this.newline());
        c.push(this.newline());

        c.push(this.align(0));
        c.push(this.textToBytes('================'));
        c.push(this.newline());
        c.push(this.newline());

        // 页脚
        c.push(this.align(1));
        c.push(this.textToBytes('谢谢惠顾'));
        c.push(this.newline());
        c.push(this.textToBytes('欢迎下次光临'));
        c.push(this.newline());
        c.push(this.newline());

        c.push(this.feed(4));
        c.push(this.cut());
        return this._mergeCommands(c);
    }

    /**
     * 简洁版模板（最少内容，快速打印）
     */
    _templateSimple(shopInfo, orderItems, total, remark) {
        const { dateStr, timeStr } = this._formatDateTime();
        let c = [];

        c.push(this.init());

        // 店铺名称
        c.push(this.align(1));
        c.push(this.setSize(2, 2));
        c.push(this.textToBytes(shopInfo.name || '生鲜小票'));
        c.push(this.newline());
        c.push(this.normalSize());
        c.push(this.newline());

        // 日期
        c.push(this.textToBytes(dateStr + ' ' + timeStr));
        c.push(this.newline());
        c.push(this.textToBytes('----------------'));
        c.push(this.newline());

        // 商品列表
        orderItems.forEach(item => {
            const name = item.name.substring(0, 8).padEnd(8, ' ');
            const qty = (item.quantity + item.unit).substring(0, 5).padStart(5, ' ');
            const price = '¥' + item.subtotal.toFixed(2);
            c.push(this.textToBytes(name + qty + price));
            c.push(this.newline());
        });

        c.push(this.textToBytes('----------------'));
        c.push(this.newline());

        // 总计
        c.push(this.bold(1));
        c.push(this.setSize(2, 1));
        c.push(this.textToBytes('合计: ¥' + total.toFixed(2)));
        c.push(this.newline());
        c.push(this.normalSize());
        c.push(this.bold(0));
        c.push(this.newline());

        c.push(this.align(1));
        c.push(this.textToBytes('谢谢惠顾'));
        c.push(this.newline());

        c.push(this.feed(3));
        c.push(this.cut());
        return this._mergeCommands(c);
    }

    /**
     * 紧凑版模板（节省纸张，无多余空行）
     */
    _templateCompact(shopInfo, orderItems, total, remark) {
        const { dateStr, timeStr } = this._formatDateTime();
        let c = [];

        c.push(this.init());

        // 店铺名称
        c.push(this.align(1));
        c.push(this.setSize(1, 1));
        c.push(this.bold(1));
        c.push(this.textToBytes(shopInfo.name || '生鲜小票'));
        c.push(this.newline());
        c.push(this.bold(0));
        if (shopInfo.phone) { c.push(this.textToBytes(shopInfo.phone)); c.push(this.newline()); }
        c.push(this.textToBytes(dateStr + ' ' + timeStr));
        c.push(this.newline());
        c.push(this.align(0));

        c.push(this.textToBytes('----------------'));
        c.push(this.newline());

        // 商品列表（紧凑排列）
        c.push(this.bold(1));
        c.push(this.textToBytes('商品       数量   金额'));
        c.push(this.bold(0));
        c.push(this.newline());

        orderItems.forEach(item => {
            const name = item.name.substring(0, 6).padEnd(6, ' ');
            const qty = (item.quantity + item.unit).substring(0, 5).padStart(5, ' ');
            const price = ('¥' + item.subtotal.toFixed(2)).padStart(7, ' ');
            c.push(this.textToBytes(name + qty + price));
            c.push(this.newline());
        });

        c.push(this.textToBytes('----------------'));
        c.push(this.newline());

        if (remark) { c.push(this.textToBytes('备注:' + remark)); c.push(this.newline()); }

        c.push(this.bold(1));
        c.push(this.textToBytes('合计:¥' + total.toFixed(2)));
        c.push(this.bold(0));
        c.push(this.newline());
        c.push(this.textToBytes('----------------'));
        c.push(this.newline());

        c.push(this.align(1));
        c.push(this.textToBytes('谢谢惠顾 欢迎下次光临'));
        c.push(this.newline());

        c.push(this.feed(2));
        c.push(this.cut());
        return this._mergeCommands(c);
    }

    /**
     * 详细版模板（含单价、备注、客户信息等）
     */
    _templateDetail(shopInfo, orderItems, total, remark) {
        const { dateStr, timeStr } = this._formatDateTime();
        let c = [];

        c.push(this.init());
        c.push(this.newline());

        // 店铺名称 - 大号居中
        c.push(this.align(1));
        c.push(this.setSize(2, 2));
        c.push(this.textToBytes(shopInfo.name || '生鲜小票'));
        c.push(this.newline());
        c.push(this.normalSize());
        c.push(this.newline());

        // 地址电话
        c.push(this.align(1));
        if (shopInfo.address) { c.push(this.textToBytes(shopInfo.address)); c.push(this.newline()); }
        if (shopInfo.phone) { c.push(this.textToBytes('电话:' + shopInfo.phone)); c.push(this.newline()); }
        c.push(this.newline());

        // 日期时间
        c.push(this.textToBytes(dateStr + ' ' + timeStr));
        c.push(this.newline());
        c.push(this.align(0));
        c.push(this.newline());

        c.push(this.textToBytes('================'));
        c.push(this.newline());
        c.push(this.newline());

        // 商品列表标题（含单价列）
        c.push(this.bold(1));
        c.push(this.textToBytes('商品    单价  数量   金额'));
        c.push(this.bold(0));
        c.push(this.newline());
        c.push(this.newline());

        // 商品列表（详细版：显示单价）
        orderItems.forEach((item, index) => {
            const name = item.name.substring(0, 4).padEnd(4, ' ');
            const unitPrice = ('¥' + item.price.toFixed(1)).substring(0, 5).padStart(5, ' ');
            const qty = (item.quantity + item.unit).substring(0, 5).padStart(5, ' ');
            const subtotal = ('¥' + item.subtotal.toFixed(2)).padStart(7, ' ');
            c.push(this.textToBytes(name + ' ' + unitPrice + ' ' + qty + ' ' + subtotal));
            c.push(this.newline());
            if (orderItems.length > 1 && index < orderItems.length - 1) c.push(this.newline());
        });

        c.push(this.newline());
        c.push(this.textToBytes('================'));
        c.push(this.newline());
        c.push(this.newline());

        // 备注
        if (remark) {
            c.push(this.textToBytes('备注: ' + remark));
            c.push(this.newline());
            c.push(this.newline());
        }

        // 商品总数
        const totalQty = orderItems.reduce((sum, item) => sum + item.quantity, 0);
        c.push(this.textToBytes('商品种类: ' + orderItems.length + ' 种'));
        c.push(this.newline());
        c.push(this.textToBytes('商品总数: ' + totalQty));
        c.push(this.newline());
        c.push(this.newline());

        // 总计
        c.push(this.bold(1));
        c.push(this.setSize(2, 2));
        c.push(this.align(1));
        c.push(this.textToBytes('合计: ¥' + total.toFixed(2)));
        c.push(this.newline());
        c.push(this.normalSize());
        c.push(this.bold(0));
        c.push(this.newline());
        c.push(this.newline());

        c.push(this.align(0));
        c.push(this.textToBytes('================'));
        c.push(this.newline());
        c.push(this.newline());

        // 页脚
        c.push(this.align(1));
        c.push(this.textToBytes('谢谢惠顾'));
        c.push(this.newline());
        c.push(this.textToBytes('欢迎下次光临'));
        c.push(this.newline());
        c.push(this.newline());

        c.push(this.feed(4));
        c.push(this.cut());
        return this._mergeCommands(c);
    }
}

/**
 * GBK 编码器
 * 利用 TextDecoder('gbk') 反向遍历所有 GBK 编码区间，构建完整的 Unicode→GBK 映射表
 * 覆盖全部 21000+ 个 GBK 汉字，彻底解决错别字和漏字问题
 */
class GBKEncoder {
    constructor() {
        this.charToBytes = null;
    }

    /**
     * 延迟初始化：遍历 GBK 双字节区间，用 TextDecoder 反查每个编码对应的 Unicode 字符
     */
    _init() {
        if (this.charToBytes) return;

        this.charToBytes = new Map();

        // ASCII 0x00-0x7F 直接映射
        for (let i = 0x00; i <= 0x7F; i++) {
            this.charToBytes.set(i, [i]);
        }

        // 手动添加 GBK 扩展区单字节字符（0x80-0xFF 中打印机常用的）
        this.charToBytes.set(0xA5, [0xA3, 0xA4]); // ¥ 人民币符号
        this.charToBytes.set(0xA1, [0xA1, 0xA1]); // （全角空格等）

        try {
            const decoder = new TextDecoder('gbk');

            // GBK 双字节编码范围：
            //   高位字节: 0x81 - 0xFE
            //   低位字节: 0x40 - 0x7E, 0x80 - 0xFE （跳过 0x7F）
            for (let hi = 0x81; hi <= 0xFE; hi++) {
                for (let lo = 0x40; lo <= 0xFE; lo++) {
                    if (lo === 0x7F) continue; // GBK 不使用 0x7F

                    const bytes = new Uint8Array([hi, lo]);
                    const char = decoder.decode(bytes);

                    // 跳过无效编码（TextDecoder 会返回替换字符 U+FFFD）
                    if (char === '\uFFFD') continue;

                    const code = char.charCodeAt(0);
                    // 跳过 ASCII 范围（已在上面处理）
                    if (code <= 0x7F) continue;

                    this.charToBytes.set(code, [hi, lo]);
                }
            }

            console.log('GBK 编码表构建完成，共 ' + (this.charToBytes.size - 128) + ' 个汉字');
        } catch (e) {
            console.error('GBK 编码表构建失败:', e);
        }
    }

    /**
     * 将字符串编码为 GBK 字节数组
     */
    encode(text) {
        this._init();

        const result = [];
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);

            // 代理对处理（emoji 等超过 BMP 的字符）
            if (code >= 0xD800 && code <= 0xDBFF) {
                const hi = code;
                const lo = text.charCodeAt(i + 1);
                if (lo >= 0xDC00 && lo <= 0xDFFF) {
                    i++; // 跳过低位代理
                }
                result.push(0x3F); // 不支持的字符用 '?' 代替
                continue;
            }

            if (code <= 0x7F) {
                // ASCII 直接输出
                result.push(code);
            } else {
                const gbkBytes = this.charToBytes.get(code);
                if (gbkBytes) {
                    result.push(gbkBytes[0], gbkBytes[1]);
                } else {
                    // 未找到编码，用 '?' 代替
                    result.push(0x3F);
                }
            }
        }

        return new Uint8Array(result);
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BluetoothPrinter, EscPosCommands, GBKEncoder };
}
