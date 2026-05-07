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
     * 生成小票内容
     * 使用简体中文，确保 GBK 编码兼容性
     */
    generateReceipt(shopInfo, orderItems, total, remark) {
        const now = new Date();
        // 手动格式化日期时间，避免 locale 产生非 GBK 字符
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        const timeStr = `${hours}:${minutes}:${seconds}`;
        
        let commands = [];
        
        // 初始化
        commands.push(this.init());
        
        // 店铺名称 - 居中放大
        commands.push(this.align(1));
        commands.push(this.setSize(2, 2));
        commands.push(this.textToBytes(shopInfo.name || '生鲜店'));
        commands.push(this.newline());
        commands.push(this.normalSize());
        commands.push(this.newline());
        
        // 地址和电话
        if (shopInfo.address) {
            commands.push(this.align(0));
            commands.push(this.textToBytes('地址:' + shopInfo.address));
            commands.push(this.newline());
        }
        if (shopInfo.phone) {
            commands.push(this.textToBytes('电话:' + shopInfo.phone));
            commands.push(this.newline());
        }
        
        // 日期时间
        commands.push(this.textToBytes(dateStr + ' ' + timeStr));
        commands.push(this.newline());
        
        // 分隔线
        commands.push(this.textToBytes('----------------'));
        commands.push(this.newline());
        
        // 商品列表标题
        commands.push(this.bold(1));
        commands.push(this.textToBytes('商品    数量    金额'));
        commands.push(this.bold(0));
        commands.push(this.newline());
        
        // 商品列表
        orderItems.forEach(item => {
            const name = item.name.substring(0, 8).padEnd(8, ' ');
            const qty = (item.quantity + item.unit).substring(0, 6).padStart(6, ' ');
            const price = ('¥' + item.subtotal.toFixed(2)).padStart(8, ' ');
            commands.push(this.textToBytes(name + qty + price));
            commands.push(this.newline());
        });
        
        // 分隔线
        commands.push(this.textToBytes('----------------'));
        commands.push(this.newline());
        
        // 备注
        if (remark) {
            commands.push(this.textToBytes('备注:' + remark));
            commands.push(this.newline());
        }
        
        // 总计
        commands.push(this.bold(1));
        commands.push(this.setSize(2, 1));
        commands.push(this.textToBytes('合计: ¥' + total.toFixed(2)));
        commands.push(this.normalSize());
        commands.push(this.bold(0));
        commands.push(this.newline());
        
        // 分隔线
        commands.push(this.textToBytes('----------------'));
        commands.push(this.newline());
        
        // 页脚
        commands.push(this.align(1));
        commands.push(this.textToBytes('谢谢惠顾'));
        commands.push(this.newline());
        commands.push(this.textToBytes('欢迎下次光临'));
        commands.push(this.newline());
        
        // 走纸并切纸
        commands.push(this.feed(3));
        commands.push(this.cut());
        
        // 合并所有命令
        let totalLength = commands.reduce((sum, arr) => sum + arr.length, 0);
        let result = new Uint8Array(totalLength);
        let offset = 0;
        commands.forEach(arr => {
            result.set(arr, offset);
            offset += arr.length;
        });
        
        return result;
    }
}

/**
 * 简化的 GBK 编码器
 * 芯烨打印机通常支持 UTF-8 或 GBK，这里尝试使用 UTF-8
 * 如果乱码，可能需要根据具体打印机型号调整
 */
class GBKEncoder {
    constructor() {
        // 常用汉字 GBK 编码表
        this.gbkTable = this._initGBKTable();
    }

    /**
     * 初始化 GBK 编码表 - 包含更多常用汉字
     */
    _initGBKTable() {
        const table = new Map();

        // ASCII 字符 (0x00-0x7F)
        for (let i = 0x00; i <= 0x7F; i++) {
            table.set(i, [i]);
        }

        // 常用汉字 GBK 编码表（蔬菜店常用字）
        const chars = {
            // 数字
            '一': [0xD2, 0xBB], '二': [0xB6, 0xFE], '三': [0xC8, 0xFD], '四': [0xCB, 0xC4],
            '五': [0xCE, 0xE5], '六': [0xC1, 0xF9], '七': [0xC6, 0xDF], '八': [0xB0, 0xCB],
            '九': [0xBE, 0xC5], '十': [0xCA, 0xAE], '百': [0xB0, 0xD9], '千': [0xC7, 0xA7],
            '万': [0xCD, 0xF2], '零': [0xC1, 0xE3],
            // 货币单位
            '元': [0xD4, 0xAA], '角': [0xBD, 0xC7], '分': [0xB7, 0xD6], '¥': [0xA3, 0xA4],
            // 重量单位
            '斤': [0xBD, 0xEF], '公': [0xB9, 0xAB], '两': [0xC1, 0xBD], '克': [0xBF, 0xCB],
            '千': [0xC7, 0xA7], '毫': [0xBA, 0xC1], '升': [0xC9, 0xFD], '毫': [0xBA, 0xC1],
            // 店铺相关
            '店': [0xB5, 0xEA], '铺': [0xC6, 0xCC], '商': [0xC9, 0xCC], '场': [0xB3, 0xA1],
            '市': [0xCA, 0xD0], '超': [0xB3, 0xAC], '新': [0xD0, 0xC2], '鲜': [0xCF, 0xCA],
            '蔬': [0xCA, 0xDF], '菜': [0xB2, 0xCB], '果': [0xB9, 0xFB], '园': [0xD4, 0xB0],
            // 蔬菜名称
            '白': [0xB0, 0xD7], '萝': [0xC2, 0xDC], '卜': [0xB7, 0xCF], '胡': [0xBA, 0xFA],
            '西': [0xCE, 0xF7], '红': [0xBA, 0xEC], '柿': [0xC1, 0xBD], '番': [0xB7, 0xAC],
            '茄': [0xC7, 0xD1], '黄': [0xBB, 0xC6], '瓜': [0xB9, 0xCF], '冬': [0xB6, 0xAC],
            '南': [0xC4, 0xCF], '丝': [0xCB, 0xBF], '苦': [0xBF, 0xE0], '瓜': [0xB9, 0xCF],
            '土': [0xCD, 0xC1], '豆': [0xB6, 0xB9], '青': [0xC7, 0xE0], '辣': [0xC0, 0xB1],
            '椒': [0xBD, 0xB7], '芹': [0xD9, 0xE7], '菠': [0xB2, 0xA4], '生': [0xC9, 0xFA],
            '姜': [0xBD, 0xAA], '葱': [0xB4, 0xD0], '蒜': [0xCB, 0xE2], '韭': [0xF1, 0xD6],
            '洋': [0xD1, 0xF3], '莴': [0xCE, 0xB6], '笋': [0xCB, 0xF1], '竹': [0xD6, 0xF1],
            '茭': [0xDC, 0xA3], '藕': [0xC5, 0xBC], '芋': [0xD3, 0xF3], '山': [0xC9, 0xBD],
            '药': [0xD2, 0xA9], '薯': [0xCA, 0xED], '番': [0xB7, 0xAC], '薯': [0xCA, 0xED],
            '紫': [0xD7, 0xCF], '甘': [0xB8, 0xCA], '蓝': [0xC0, 0xB6], '花': [0xBB, 0xA8],
            '椰': [0xD2, 0xAC], '菜': [0xB2, 0xCB], '油': [0xD3, 0xCD], '麦': [0xC2, 0xF3],
            '小': [0xD0, 0xA1], '白': [0xB0, 0xD7], '油': [0xD3, 0xCD], '菜': [0xB2, 0xCB],
            '空': [0xBF, 0xD5], '心': [0xD0, 0xC4], '苋': [0xDC, 0xC5], '菜': [0xB2, 0xCB],
            '香': [0xCF, 0xE3], '菇': [0xB9, 0xBD], '平': [0xC6, 0xBD], '金': [0xBD, 0xF0],
            '针': [0xD5, 0xEB], '银': [0xD2, 0xF8], '耳': [0xB6, 0xFA], '木': [0xC4, 0xBE],
            '腐': [0xB8, 0xAF], '竹': [0xD6, 0xF1], '腐': [0xB8, 0xAF], '豆': [0xB6, 0xB9],
            '腐': [0xB8, 0xAF], '皮': [0xC6, 0xA4], '干': [0xB8, 0xC9], '豆': [0xB6, 0xB9],
            '芽': [0xD1, 0xBF], '腐': [0xB8, 0xAF], '竹': [0xD6, 0xF1],
            // 肉类
            '猪': [0xD6, 0xED], '肉': [0xC8, 0xE2], '牛': [0xC5, 0xA3], '羊': [0xD1, 0xF2],
            '鸡': [0xBC, 0xA6], '鸭': [0xD1, 0xBC], '鱼': [0xD3, 0xE3], '虾': [0xCF, 0xBA],
            '蟹': [0xD0, 0xB7], '排': [0xC5, 0xC5], '骨': [0xC7, 0xC5], '瘦': [0xCA, 0xDD],
            '肥': [0xB7, 0xCA], '五': [0xCE, 0xE5], '花': [0xBB, 0xA8],
            // 时间
            '日': [0xC8, 0xD5], '期': [0xC6, 0xDA], '时': [0xCA, 0xB1], '间': [0xBC, 0xE4],
            '年': [0xC4, 0xEA], '月': [0xD4, 0xC2], '星': [0xD0, 0xC7], '分': [0xB7, 0xD6],
            '秒': [0xC3, 0xEB], '早': [0xD4, 0xE7], '上': [0xC9, 0xCF], '中': [0xD6, 0xD0],
            '午': [0xCE, 0xE7], '下': [0xCF, 0xC2], '晚': [0xCD, 0xED],
            // 金额相关
            '合': [0xBA, 0xCF], '计': [0xBC, 0xC6], '金': [0xBD, 0xF0], '额': [0xB6, 0xEE],
            '数': [0xCA, 0xFD], '量': [0xC1, 0xBF], '单': [0xB5, 0xA5], '价': [0xBC, 0xDB],
            '总': [0xD7, 0xDC], '共': [0xB9, 0xB2], '应': [0xD3, 0xA6], '付': [0xB8, 0xB6],
            '实': [0xCA, 0xB5], '收': [0xCA, 0xD5], '找': [0xD5, 0xD2], '零': [0xC1, 0xE3],
            '折': [0xD5, 0xDB], '扣': [0xDB, 0xD3], '优': [0xD3, 0xC5], '惠': [0xBB, 0xDD],
            // 信息
            '品': [0xC6, 0xB7], '名': [0xC3, 0xFB], '称': [0xB3, 0xC6], '规': [0xB9, 0xE6],
            '格': [0xB8, 0xF1], '地': [0xB5, 0xD8], '址': [0xD6, 0xB7], '电': [0xB5, 0xE7],
            '话': [0xBB, 0xB0], '备': [0xB1, 0xB8], '注': [0xD7, 0xA2], '条': [0xCC, 0xF5],
            '码': [0xC2, 0xEB], '编': [0xB1, 0xE0], '号': [0xBA, 0xC5],
            // 礼貌用语
            '谢': [0xD0, 0xBB], '惠': [0xBB, 0xDD], '顾': [0xB9, 0xCB], '欢': [0xBB, 0xB6],
            '迎': [0xD3, 0xAD], '次': [0xB4, 0xCE], '光': [0xB9, 0xE2], '临': [0xC1, 0xD9],
            '再': [0xD4, 0xD9], '见': [0xBC, 0xFB], '请': [0xC7, 0xEB], '慢': [0xC2, 0xFD],
            '走': [0xD7, 0xDF], '多': [0xB6, 0xE0], '关': [0xB9, 0xD8], '照': [0xD5, 0xD5],
            // 票据相关
            '订': [0xB6, 0xA9], '票': [0xC6, 0xB1], '清': [0xC7, 0xE5], '明': [0xC3, 0xF7],
            '细': [0xCF, 0xB8], '据': [0xBE, 0xDD], '根': [0xB8, 0xF9], '客': [0xBF, 0xCD],
            '留': [0xC1, 0xF4], '存': [0xB4, 0xE6], '联': [0xC1, 0xAA], '系': [0xCF, 0xB5],
            '人': [0xC8, 0xCB], '员': [0xD4, 0xB1], '服': [0xB7, 0xFE], '务': [0xCE, 0xF1],
            // 支付
            '民': [0xC3, 0xF1], '币': [0xB1, 0xD2], '支': [0xD6, 0xA7], '方': [0xB7, 0xBD],
            '式': [0xCA, 0xBD], '现': [0xCF, 0xD6], '微': [0xCE, 0xA2], '信': [0xD0, 0xC5],
            '宝': [0xB1, 0xA6], '扫': [0xC9, 0xA8], '卡': [0xBF, 0xA8], '刷': [0xCB, 0xA2],
            '银': [0xD2, 0xF8], '行': [0xD0, 0xD0], '转': [0xD7, 0xAA], '账': [0xD5, 0xCB],
            // 标点符号
            '，': [0xA3, 0xAC], '。': [0xA1, 0xA3], '、': [0xA1, 0xA2], '：': [0xA3, 0xBA],
            '；': [0xA3, 0xBB], '！': [0xA3, 0xA1], '？': [0xA3, 0xBF],
            '（': [0xA3, 0xA8],
            '）': [0xA3, 0xA9], '【': [0xA1, 0xBE], '】': [0xA1, 0xBF], '《': [0xA1, 0xB6],
            '》': [0xA1, 0xB7], '—': [0xA3, 0xAD], '…': [0xA1, 0xAD], '·': [0xA1, 0xA4],
            // 其他常用字
            '的': [0xB5, 0xC4], '了': [0xC1, 0xCB], '是': [0xCA, 0xC7], '我': [0xCE, 0xD2],
            '一': [0xD2, 0xBB], '不': [0xB2, 0xBB], '在': [0xD4, 0xDA], '人': [0xC8, 0xCB],
            '有': [0xD3, 0xD0], '这': [0xD5, 0xE2], '个': [0xB8, 0xF6], '上': [0xC9, 0xCF],
            '们': [0xC3, 0xC7], '来': [0xC0, 0xB4], '到': [0xB5, 0xBD], '时': [0xCA, 0xB1],
            '大': [0xB4, 0xF3], '地': [0xB5, 0xD8], '为': [0xCE, 0xAA], '子': [0xD7, 0xD3],
            '中': [0xD6, 0xD0], '你': [0xC4, 0xE3], '说': [0xCB, 0xB5], '生': [0xC9, 0xFA],
            '国': [0xB9, 0xFA], '年': [0xC4, 0xEA], '着': [0xD7, 0xC5], '就': [0xBE, 0xCD],
            '那': [0xC4, 0xC7], '和': [0xBA, 0xCD], '要': [0xD2, 0xAA], '她': [0xCB, 0xFD],
            '出': [0xB3, 0xF6], '也': [0xD2, 0xB2], '得': [0xB5, 0xC3], '里': [0xC0, 0xEF],
            '后': [0xBA, 0xF3], '自': [0xD7, 0xD4], '以': [0xD2, 0xD4], '会': [0xBB, 0xE1],
            '家': [0xBC, 0xD2], '可': [0xBF, 0xC9], '下': [0xCF, 0xC2], '而': [0xB6, 0xF8],
            '过': [0xB9, 0xFD], '天': [0xCC, 0xEC], '去': [0xC8, 0xA5], '能': [0xC4, 0xDC],
            '对': [0xB6, 0xD4], '小': [0xD0, 0xA1], '多': [0xB6, 0xE0], '然': [0xC8, 0xBB],
            '于': [0xD3, 0xDA], '心': [0xD0, 0xC4], '学': [0xD1, 0xA7], '都': [0xB6, 0xBC],
            '看': [0xBF, 0xB4], '发': [0xB7, 0xA2], '当': [0xB5, 0xB1], '没': [0xC3, 0xBB],
            '成': [0xB3, 0xC9], '只': [0xD6, 0xBB], '如': [0xC8, 0xE7], '事': [0xCA, 0xC2],
            '把': [0xB0, 0xD1], '还': [0xBB, 0xB9], '用': [0xD3, 0xC3], '第': [0xB5, 0xDA],
            '样': [0xD1, 0xF9], '道': [0xB5, 0xC0], '想': [0xCF, 0xEB], '作': [0xD7, 0xF7],
            '种': [0xD6, 0xD6], '开': [0xBF, 0xAA], '美': [0xC3, 0xC0], '总': [0xD7, 0xDC],
            '从': [0xB4, 0xD3], '无': [0xCE, 0xDE], '情': [0xC7, 0xE9], '己': [0xBC, 0xBA],
            '面': [0xC3, 0xE6], '最': [0xD7, 0xEE], '女': [0xC5, 0xAE], '但': [0xB5, 0xAB],
            '现': [0xCF, 0xD6], '前': [0xC7, 0xB0], '些': [0xD0, 0xA9], '所': [0xCB, 0xF9],
            '同': [0xCD, 0xAC], '手': [0xCA, 0xD6], '又': [0xD3, 0xD6], '行': [0xD0, 0xD0],
            '意': [0xD2, 0xE2], '动': [0xB6, 0xAF], '方': [0xB7, 0xBD], '它': [0xCB, 0xFC],
            '头': [0xCD, 0xB7], '经': [0xBE, 0xAD], '长': [0xB3, 0xA4], '儿': [0xB6, 0xF9],
            '回': [0xBB, 0xD8], '位': [0xCE, 0xBB], '分': [0xB7, 0xD6], '爱': [0xB0, 0xAE],
            '老': [0xC0, 0xCF], '因': [0xD2, 0xF2], '很': [0xBA, 0xDC], '给': [0xB8, 0xF8],
            '名': [0xC3, 0xFB], '法': [0xB7, 0xA8], '间': [0xBC, 0xE4], '斯': [0xCB, 0xB9],
            '知': [0xD6, 0xAA], '世': [0xCA, 0xC0], '什': [0xCA, 0xB2], '两': [0xC1, 0xBD],
            '次': [0xB4, 0xCE], '使': [0xCA, 0xB9], '体': [0xCC, 0xE5], '今': [0xBD, 0xF1],
            '正': [0xD5, 0xFD], '呢': [0xC4, 0xD8], '觉': [0xBE, 0xF5], '得': [0xB5, 0xC3],
            '让': [0xC8, 0xC3], '此': [0xB4, 0xCB], '用': [0xD3, 0xC3], '打': [0xB4, 0xF2],
            '已': [0xD2, 0xD1], '文': [0xCE, 0xC4], '将': [0xBD, 0xAB], '机': [0xBB, 0xFA],
            '十': [0xCA, 0xAE], '张': [0xD5, 0xC5], '每': [0xC3, 0xBF], '少': [0xC9, 0xD9],
            '算': [0xCB, 0xE3], '万': [0xCD, 0xF2], '比': [0xB1, 0xC8], '太': [0xCC, 0xAB],
            '次': [0xB4, 0xCE], '先': [0xCF, 0xC8], '再': [0xD4, 0xD9], '么': [0xC3, 0xB4],
            '口': [0xBF, 0xDA], '更': [0xB8, 0xFC], '王': [0xCD, 0xF5], '马': [0xC2, 0xED],
            '等': [0xB5, 0xC8], '节': [0xBD, 0xDA], '其': [0xC6, 0xE4], '进': [0xBD, 0xF8],
            '点': [0xB5, 0xE3], '重': [0xD6, 0xD8], '并': [0xB2, 0xA2], '师': [0xCA, 0xA6],
            '全': [0xC8, 0xAB], '厂': [0xB3, 0xA7], '快': [0xBF, 0xEC], '目': [0xC4, 0xBF],
            '放': [0xB7, 0xC5], '才': [0xB2, 0xC5], '好': [0xBA, 0xC3], '变': [0xB1, 0xE4],
            '通': [0xCD, 0xA8], '外': [0xCD, 0xE2], '问': [0xCE, 0xCA], '高': [0xB8, 0xDF],
            '记': [0xBC, 0xC7], '根': [0xB8, 0xF9], '干': [0xB8, 0xC9], '造': [0xD4, 0xEC],
            '百': [0xB0, 0xD9], '务': [0xCE, 0xF1], '必': [0xB1, 0xD8], '真': [0xD5, 0xE6],
            '理': [0xC0, 0xED], '色': [0xC9, 0xAB], '比': [0xB1, 0xC8], '或': [0xBB, 0xF2],
            '身': [0xC9, 0xED], '入': [0xC8, 0xEB], '由': [0xD3, 0xC9], '常': [0xB3, 0xA3],
            '原': [0xD4, 0xAD], '内': [0xC4, 0xDA], '加': [0xBC, 0xD3], '化': [0xBB, 0xAF],
            '告': [0xB8, 0xE6], '历': [0xC0, 0xFA], '程': [0xCC, 0xC3], '选': [0xD1, 0xA1],
            '安': [0xB0, 0xB2], '写': [0xD0, 0xB4], '绝': [0xBE, 0xF8], '收': [0xCA, 0xD5],
            '远': [0xD4, 0xB6], '算': [0xCB, 0xE3], '往': [0xCD, 0xF9], '权': [0xC8, 0xA8],
            '找': [0xD5, 0xD2], '料': [0xC1, 0xCF], '确': [0xC8, 0xB7], '究': [0xBE, 0xBF],
            '竟': [0xBE, 0xB9], '衣': [0xD2, 0xC2], '装': [0xD7, 0xB0], '般': [0xB0, 0xE3],
            '门': [0xC3, 0xC5], '任': [0xC8, 0xCE], '持': [0xB3, 0xD6], '容': [0xC8, 0xDD],
            '需': [0xD0, 0xE8], '传': [0xB4, 0xAB], '观': [0xB9, 0xDB], '切': [0xC7, 0xD0],
            '深': [0xC9, 0xEE], '约': [0xD4, 0xBC], '字': [0xD7, 0xD6], '母': [0xC4, 0xB8],
            '众': [0xD6, 0xDA], '拿': [0xC4, 0xC3], '解': [0xBD, 0xE2], '容': [0xC8, 0xDD],
            '至': [0xD6, 0xC1], '照': [0xD5, 0xD5], '写': [0xD0, 0xB4], '声': [0xC9, 0xF9],
            '诉': [0xCB, 0xDF], '近': [0xBD, 0xFC], '非': [0xB7, 0xC7], '反': [0xB7, 0xB4],
            '且': [0xC7, 0xD2], '范': [0xB7, 0xB6], '围': [0xCE, 0xA7], '格': [0xB8, 0xF1],
            '半': [0xB0, 0xEB], '办': [0xB0, 0xEC], '包': [0xB0, 0xFC], '华': [0xBB, 0xAA],
            '确': [0xC8, 0xB7], '论': [0xC2, 0xDB], '建': [0xBD, 0xA8], '难': [0xC4, 0xD1],
            '查': [0xB2, 0xE9], '照': [0xD5, 0xD5], '举': [0xBE, 0xD9], '亚': [0xD1, 0xC7],
            '杀': [0xC9, 0xB1], '士': [0xCA, 0xBF], '推': [0xCD, 0xC6], '思': [0xCB, 0xBC],
            '术': [0xCA, 0xF5], '极': [0xBC, 0xAB], '双': [0xCB, 0xAB], '活': [0xBB, 0xEE],
            '神': [0xC9, 0xF1], '确': [0xC8, 0xB7], '管': [0xB9, 0xDC], '特': [0xCC, 0xD8],
            '造': [0xD4, 0xEC], '完': [0xCD, 0xEA], '集': [0xBC, 0xAF], '院': [0xD4, 0xBA],
            '像': [0xCF, 0xF1], '马': [0xC2, 0xED], '准': [0xD7, 0xBC], '眼': [0xD1, 0xDB],
            '细': [0xCF, 0xB8], '则': [0xD4, 0xF2], '却': [0xC8, 0xB4], '效': [0xD0, 0xA7],
            '按': [0xB0, 0xB4], '座': [0xD7, 0xF9], '视': [0xCA, 0xD3], '五': [0xCE, 0xE5],
            '月': [0xD4, 0xC2], '份': [0xB7, 0xDD], '天': [0xCC, 0xEC], '气': [0xC6, 0xF8],
            '冷': [0xC0, 0xE4], '暖': [0xC5, 0xAF], '热': [0xC8, 0xC8], '度': [0xB6, 0xC8],
        };

        // 添加汉字到编码表
        for (const [char, bytes] of Object.entries(chars)) {
            table.set(char.charCodeAt(0), bytes);
        }

        // 添加 ASCII 可打印字符 (0x20-0x7E)
        for (let i = 0x20; i <= 0x7E; i++) {
            if (!table.has(i)) {
                table.set(i, [i]);
            }
        }

        // 添加常用符号（小票中可能用到的）
        const symbols = {
            '¥': [0xA3, 0xA4],      // 人民币符号
            '＋': [0xA3, 0xAB],     // 加号
            '－': [0xA3, 0xAD],     // 减号
            '×': [0xA3, 0xD7],     // 乘号
            '÷': [0xA3, 0xB0],     // 除号
            '％': [0xA3, 0xA5],     // 百分号
            '（': [0xA3, 0xA8],     // 左括号
            '）': [0xA3, 0xA9],     // 右括号
            '【': [0xA1, 0xBE],     // 左方括号
            '】': [0xA1, 0xBF],     // 右方括号
            '〖': [0xA1, 0xB6],     // 左花括号
            '〗': [0xA1, 0xB7],     // 右花括号
        };

        // 添加符号到编码表
        for (const [char, bytes] of Object.entries(symbols)) {
            table.set(char.charCodeAt(0), bytes);
        }

        return table;
    }

    /**
     * 编码字符串为 GBK 字节数组
     */
    encode(text) {
        const result = [];

        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i);

            // ASCII 字符 (0x00-0x7F)
            if (charCode <= 0x7F) {
                result.push(charCode);
            } else {
                // 查找 GBK 编码
                const gbkBytes = this.gbkTable.get(charCode);
                if (gbkBytes) {
                    result.push(...gbkBytes);
                } else {
                    // 未找到的字符，用空格代替
                    result.push(0x20); // 空格
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
