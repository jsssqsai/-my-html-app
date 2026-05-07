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
     */
    async print(text) {
        if (!this.isConnected || !this.characteristic) {
            throw new Error('打印机未连接');
        }

        try {
            // 将文本转换为 GBK 编码的 Uint8Array
            const encoder = new TextEncoder();
            const data = encoder.encode(text);
            
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
     */
    textToBytes(text) {
        // 简单实现：使用 TextEncoder
        const encoder = new TextEncoder();
        return encoder.encode(text);
    }

    /**
     * 生成小票内容
     */
    generateReceipt(shopInfo, orderItems, total, remark) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('zh-CN');
        const timeStr = now.toLocaleTimeString('zh-CN');
        
        let commands = [];
        
        // 初始化
        commands.push(this.init());
        
        // 店铺名称 - 居中放大
        commands.push(this.align(1));
        commands.push(this.setSize(2, 2));
        commands.push(this.textToBytes(shopInfo.name || '蔬菜店'));
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

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BluetoothPrinter, EscPosCommands };
}
