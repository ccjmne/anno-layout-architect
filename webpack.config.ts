import { resolve } from 'path';
import { Configuration } from 'webpack';

import CopyWebpackPlugin from 'copy-webpack-plugin';
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';
import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import HtmlWebpackPlugin, { MinifyOptions } from 'html-webpack-plugin';
import ImageminPlugin from 'imagemin-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import ScriptExtHtmlWebpackPlugin from 'script-ext-html-webpack-plugin';
import StyleExtHtmlWebpackPlugin from 'style-ext-html-webpack-plugin';

import { author, description, keywords, repository } from './package.json';

const HTML_MINIFY_OPTS: MinifyOptions = {
  removeComments: true,
  collapseWhitespace: true,
  conservativeCollapse: true,
  removeAttributeQuotes: true,
  useShortDoctype: true,
  keepClosingSlash: true,
  minifyJS: true,
  minifyCSS: true,
  removeScriptTypeAttributes: true,
};

const assets = resolve(__dirname, 'assets');
const src = resolve(__dirname, 'src');
const sass = resolve(__dirname, 'sass');

export default (_env: string, { mode, analyze }: { mode?: 'production' | 'development', analyze?: boolean }): Configuration => ({
  entry: {
    'main': resolve(src, 'index.ts'),
    'main-styles': resolve(src, 'main.scss'),
  },
  devtool: (mode === 'production' ? false : 'cheap-module-eval-source-map'),
  optimization: {
    usedExports: true,
  },
  resolve: {
    modules: [src, 'node_modules'],
  },
  module: {
    rules: [{
      test: /\.ttf$/,
      use: [
        { loader: 'file-loader' },
      ],
    }, {
      test: /\.js$/,
      exclude: /node_modules/,
      use: [{
        loader: 'babel-loader',
        options: {
          presets: [
            ['@babel/preset-env', { targets: { node: 'current' } }],
          ],
          plugins: ['@babel/plugin-syntax-dynamic-import'],
        },
      }],
    }, {
      test: /\.ts$/,
      exclude: /node_modules/,
      use: [{
        loader: 'ts-loader',
      }],
    }, {
      test: /\.html$/,
      use: [{
        loader: 'html-loader',
        options: {
          attributes: {
            list: [
              { tag: 'img', attribute: 'src', type: 'src' },
              { tag: 'img', attribute: 'data-src', type: 'src' },
              { tag: 'video', attribute: 'src', type: 'src' },
              { tag: 'video', attribute: 'data-src', type: 'src' },
            ],
          },
          minimize: mode === 'production' && HTML_MINIFY_OPTS,
        },
      }],
    }, {
      test: /(?<!\.inline)\.s?css$/,
      enforce: 'pre',
      use: [
        { loader: MiniCssExtractPlugin.loader },
      ],
    }, {
      test: /\.s?css$/,
      enforce: 'pre',
      use: [
        { loader: 'css-loader' },
      ],
    }, {
      test: /\.scss$/,
      enforce: 'pre',
      use: [
        { loader: 'sass-loader' },
        { loader: 'sass-resources-loader', options: { resources: resolve(sass, 'scss-inject.scss') } },
      ],
    }, {
      test: /\.(png|jpe?g|gif|ico|webp|mp4)$/,
      use: [
        { loader: 'url-loader', options: { limit: 2048, outputPath: assets } },
      ],
    }, {
      test: /\.svg$/,
      issuer: /\.(html|js)$/,
      use: [
        { loader: 'file-loader', options: { outputPath: assets } },
      ],
    }, {
      test: /\.svg$/,
      issuer: /\.s?css$/,
      use: [
        { loader: 'svg-url-loader' },
      ],
    }, {
      test: /\.(png|jpe?g|gif|ico|svg|webp|mp4)$/,
      enforce: 'pre',
      use: [
        { loader: 'image-webpack-loader' },
      ],
    }],
  },
  plugins: [].concat(
    mode === 'production' ? new CleanWebpackPlugin() : [],
    new CopyWebpackPlugin({ patterns: [{ from: resolve(assets, 'favicons'), to: 'favicons' }] }),
    analyze ? new BundleAnalyzerPlugin() : [],
    new HtmlWebpackPlugin({
      template: resolve(__dirname, 'index.html'),
      cache: false, // style-ext plugin doesn't properly notify changes
      chunks: ['main'],
      chunksSortMode: 'manual',
      minify: HTML_MINIFY_OPTS,
      meta: { author, description, repository, keywords: keywords.join(', ') },
    }),
    new MiniCssExtractPlugin({
      filename: '[name].css',
      chunkFilename: 'chunk-[id].css',
    }),
    new ScriptExtHtmlWebpackPlugin({ defaultAttribute: 'defer' }),
    new StyleExtHtmlWebpackPlugin(), // ideally would the specific { chunks: ['main-styles'] } currently broken option
    mode === 'production' ? new ImageminPlugin({}) : [],
  ),
});
