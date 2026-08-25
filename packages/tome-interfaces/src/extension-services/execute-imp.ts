import type {
  ExecuteImpContext,
  ImpCollectionResult,
  ImpGraph,
} from "tome-graph-interfaces";

/** Host-mediated Imp graph execution for extension page blocks. */
export interface ExtensionExecuteImpServices {
  executeImp(
    graph: ImpGraph,
    context?: ExecuteImpContext,
  ): ImpCollectionResult | Promise<ImpCollectionResult>;
}
