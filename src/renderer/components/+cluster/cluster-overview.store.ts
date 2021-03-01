import { action, observable, reaction, when } from "mobx";
import { KubeObjectStore } from "../../kube-object.store";
import { Cluster, clusterApi, IClusterMetrics } from "../../api/endpoints";
import { autobind } from "../../utils";
import { createStorage } from "../../local-storage";
import { IMetricsReqParams, normalizeMetrics } from "../../api/endpoints/metrics.api";
import { nodesStore } from "../+nodes/nodes.store";
import { apiManager } from "../../api/api-manager";

export enum MetricType {
  MEMORY = "memory",
  CPU = "cpu"
}

export enum MetricNodeRole {
  MASTER = "master",
  WORKER = "worker"
}

export interface ClusterOverviewStorageState {
  metricType: MetricType;
  metricNodeRole: MetricNodeRole,
}

const localStorage = createStorage<ClusterOverviewStorageState>("cluster_overview", {
  metricType: MetricType.CPU, // setup defaults
  metricNodeRole: MetricNodeRole.WORKER,
});

@autobind()
export class ClusterOverviewStore extends KubeObjectStore<Cluster> implements ClusterOverviewStorageState {
  api = clusterApi;

  @observable metrics: Partial<IClusterMetrics> = {};
  @observable metricsLoaded = false;

  get metricType(): MetricType {
    return localStorage.get().metricType;
  }

  set metricType(value: MetricType) {
    localStorage.merge({ metricType: value });
  }

  get metricNodeRole(): MetricNodeRole {
    return localStorage.get().metricNodeRole;
  }

  set metricNodeRole(value: MetricNodeRole) {
    localStorage.merge({ metricNodeRole: value });
  }

  constructor() {
    super();
    this.init();
  }

  private async init() {
    // TODO: refactor, seems not a correct place to be
    // auto-refresh metrics on user-action
    reaction(() => this.metricNodeRole, () => {
      if (!this.metricsLoaded) return;
      this.resetMetrics();
      this.loadMetrics();
    });

    // check which node type to select
    reaction(() => nodesStore.items.length, () => {
      const { masterNodes, workerNodes } = nodesStore;

      if (!masterNodes.length) this.metricNodeRole = MetricNodeRole.WORKER;
      if (!workerNodes.length) this.metricNodeRole = MetricNodeRole.MASTER;
    });
  }

  @action
  async loadMetrics(params?: IMetricsReqParams) {
    await when(() => nodesStore.isLoaded);
    const { masterNodes, workerNodes } = nodesStore;
    const nodes = this.metricNodeRole === MetricNodeRole.MASTER && masterNodes.length ? masterNodes : workerNodes;

    this.metrics = await clusterApi.getMetrics(nodes.map(node => node.getName()), params);
    this.metricsLoaded = true;
  }

  getMetricsValues(source: Partial<IClusterMetrics>): [number, string][] {
    switch (this.metricType) {
      case MetricType.CPU:
        return normalizeMetrics(source.cpuUsage).data.result[0].values;
      case MetricType.MEMORY:
        return normalizeMetrics(source.memoryUsage).data.result[0].values;
      default:
        return [];
    }
  }

  @action
  resetMetrics() {
    this.metrics = {};
    this.metricsLoaded = false;
  }

  reset() {
    super.reset();
    this.resetMetrics();
    localStorage.reset();
  }
}

export const clusterOverviewStore = new ClusterOverviewStore();
apiManager.registerStore(clusterOverviewStore);
