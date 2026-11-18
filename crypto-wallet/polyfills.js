// polyfills.js
import "react-native-get-random-values";
import "fast-text-encoding";
import { Buffer } from "buffer";

global.Buffer = global.Buffer || Buffer;
