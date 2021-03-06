import { adapters,constants } from '@cloudbase/utilities';
import { SDKAdapterInterface, CloudbaseAdapter, IRequestConfig } from '@cloudbase/adapter-interface';
import { ICloudbaseConfig, ICloudbaseUpgradedConfig, ICloudbase, ICloudbaseExtension, KV, ICloudbasePlatformInfo } from '@cloudbase/types';
import { ICloudbaseAuth } from '@cloudbase/types/auth';
import adapterForWxMp from 'cloudbase-adapter-wx_mp';
import { registerComponent } from './libs/component';
import { Platform } from './libs/adapter';
import { ICloudbaseComponent } from '@cloudbase/types/component';
import { ICloudbaseCache } from '@cloudbase/types/cache';
import { initCache, getCacheByEnvId, getLocalCache } from './libs/cache';
import { ICloudbaseRequest } from '@cloudbase/types/request';
import { initRequest, getRequestByEnvId } from './libs/request';
import { SDK_NAME, setSdkVersion, setEndPoint } from './constants/common';

const { useAdapters, useDefaultAdapter, RUNTIME } = adapters;
const { ERRORS } = constants;

/**
 * @constant 默认配置
 */
const DEFAULT_INIT_CONFIG:Partial<ICloudbaseConfig> = {
  timeout: 15000,
  persistence: 'session'
};

// timeout上限10分钟
const MAX_TIMEOUT = 1000 * 60 * 10;
// timeout下限100ms
const MIN_TIMEOUT = 100;

const extensionMap:KV<ICloudbaseExtension> = {};

class Cloudbase implements ICloudbase{
  public authInstance: ICloudbaseAuth;
  public requestClient: any;
  private _config: ICloudbaseConfig;

  constructor(config?: ICloudbaseConfig) {
    this._config = config ? config : this._config;
    this.authInstance = null;
  }

  get config(){
    return this._config;
  }

  get platform():ICloudbasePlatformInfo{
    return Platform;
  }

  get cache():ICloudbaseCache{
    return getCacheByEnvId(this._config.env);
  }

  get localCache():ICloudbaseCache{
    return getLocalCache(this._config.env);
  }

  get request():ICloudbaseRequest{
    return getRequestByEnvId(this._config.env);
  }

  public init(config: ICloudbaseConfig):Cloudbase {
    // 初始化时若未兼容平台，则使用默认adapter
    if (!Platform.adapter) {
      this._useDefaultAdapter();
    }

    this.requestClient = new Platform.adapter.reqClass({
      timeout: config.timeout || 5000,
      timeoutMsg: `[${SDK_NAME}][REQUEST TIMEOUT] request had been abort since didn\'t finished within${config.timeout / 1000}s`
    } as IRequestConfig);
    if (Platform.runtime !== RUNTIME.WEB) {
      if (!config.appSecret) {
        throw new Error(`[${SDK_NAME}][${ERRORS.INVALID_PARAMS}]invalid appSecret`);
      }
      // adapter提供获取应用标识的接口
      const appSign = Platform.adapter.getAppSign ? Platform.adapter.getAppSign() : '';
      if (config.appSign && appSign && config.appSign !== appSign) {
        // 传入的appSign与sdk获取的不一致
        throw new Error(`[${SDK_NAME}][${ERRORS.INVALID_PARAMS}]invalid appSign`);
      }
      appSign && (config.appSign = appSign);
      if (!config.appSign) {
        throw new Error(`[${SDK_NAME}][${ERRORS.INVALID_PARAMS}]invalid appSign`);
      }
    }
    this._config = {
      ...DEFAULT_INIT_CONFIG,
      ...config
    };
    // 修正timeout取值
    this._config.timeout = this._formatTimeout(this._config.timeout);
    // 初始化cache和request
    const { env, persistence, debug, timeout, appSecret, appSign} = this._config;
    initCache({ env, persistence, debug, platformInfo:this.platform});
    initRequest({ env, timeout, appSecret, appSign});

    return new Cloudbase(this._config);
  }

  public updateConfig(config: ICloudbaseUpgradedConfig){
    const { persistence, debug } = config;
    this._config.persistence = persistence;
    this._config.debug = debug;
    // persistence改动影响cache
    initCache({ env:this._config.env, persistence, debug, platformInfo:this.platform});
  }

  public registerExtension(ext:ICloudbaseExtension) {
    extensionMap[ext.name] = ext;
  }

  public async invokeExtension(name:string, opts:any) {
    const ext = extensionMap[name];
    if (!ext) {
      throw Error(`[${SDK_NAME}][${ERRORS.INVALID_PARAMS}]extension:${name} must be registered before invoke`);
    }

    return await ext.invoke(opts, this);
  }

  public useAdapters(adapters: CloudbaseAdapter|CloudbaseAdapter[]) {
    const { adapter, runtime } = useAdapters(adapters) || {};
    adapter && (Platform.adapter = adapter as SDKAdapterInterface);
    runtime && (Platform.runtime = runtime as string);
  }

  public registerComponent(component:ICloudbaseComponent){
    registerComponent(Cloudbase,component);
  }

  public registerVersion(version:string){
    setSdkVersion(version);
  }

  public registerEndPoint(url:string,protocol?:'http'|'https'){
    setEndPoint(url,protocol)
  }

  private _useDefaultAdapter() {
    const { adapter, runtime } = useDefaultAdapter();
    Platform.adapter = adapter as SDKAdapterInterface;
    Platform.runtime = runtime as string;
  }

  private _formatTimeout(timeout:number){
    switch (true) {
      case timeout > MAX_TIMEOUT:
        console.warn(`[${SDK_NAME}][${ERRORS.INVALID_PARAMS}]timeout is greater than maximum value[10min]`);
        return MAX_TIMEOUT;
      case timeout < MIN_TIMEOUT:
        console.warn(`[${SDK_NAME}][${ERRORS.INVALID_PARAMS}]timeout is less than maximum value[100ms]`);
        return MIN_TIMEOUT;
      default:
        return timeout;
    }
  }
}

export const cloudbase:ICloudbase = new Cloudbase();
cloudbase.useAdapters(adapterForWxMp);

export default cloudbase;